import type data from '@data/index'
import { Storage } from '@google-cloud/storage'
import * as DateFns from 'date-fns'
import { strToU8, type Zippable, zip } from 'fflate'
import type { Logger } from 'pino'
import type { Config } from '@/config'
import { logError } from '@/utils'

export class UserDataError extends Error {
  constructor(
    message: string,
    public readonly errors: Record<string, string[]> = {}
  ) {
    super(message)
    this.name = 'UserDataError'
  }
}

type DenormalizedInfo = {
  favorites?: string[]
  relations?: { approved?: string[]; disapproved?: string[] }
} & Record<string, unknown>

export default class UserDataAPI {
  private readonly logger: Logger
  private readonly storage: Storage
  private readonly imageBucket: string
  private readonly baseImageUrl: string

  constructor(
    private readonly db: ReturnType<typeof data>,
    config: Config,
    _logger: Logger
  ) {
    this.logger = _logger.child({ module: 'user-data-api' })
    this.storage = new Storage()
    this.imageBucket = config.imageBucket
    // new URL(path, base) replaces the last segment of a base without a trailing slash,
    // which would silently drop the bucket path from returned URLs
    this.baseImageUrl = config.baseImageUrl.endsWith('/') ? config.baseImageUrl : `${config.baseImageUrl}/`
    this.logger.info('UserDataAPI initialized')
  }

  async downloadUserData(userUid: string) {
    this.logger.info({ userUid }, 'Exporting user data')
    try {
      const user = await this.db.selectFrom('users').selectAll().where('uid', '=', userUid).executeTakeFirst()
      if (user == null) throw new UserDataError('User not found', { user: ['User not found'] })

      const dateStamp = DateFns.format(new Date(), 'yyyy-MM-dd')
      const zipPath = `user_data/dt=${dateStamp}/${userUid}_data.zip`
      const bucket = this.storage.bucket(this.imageBucket)
      const zipFile = bucket.file(zipPath)
      const [alreadyExported] = await zipFile.exists()
      if (alreadyExported) {
        const message = 'You already exported your data today. You can only do it once a day.'
        throw new UserDataError(message, { export: [message] })
      }

      const posts = await this.db
        .selectFrom('posts')
        .leftJoin('postTargets', 'postTargets.postUid', 'posts.uid')
        .select([
          'posts.uid as uid',
          'content',
          'imageUrl',
          'linkUrl',
          'linkText',
          'posts.status as status',
          'postTargets.type as audience',
          'posts.created as created',
          'posts.updated as updated'
        ])
        .where('posts.userUid', '=', userUid)
        .orderBy('posts.created', 'asc')
        .execute()

      const comments = await this.db
        .selectFrom('comments')
        .innerJoin('posts', 'posts.id', 'comments.postId')
        .select([
          'comments.uid as uid',
          'posts.uid as postUid',
          'comments.content as content',
          'comments.created as created',
          'comments.updated as updated'
        ])
        .where('comments.userUid', '=', userUid)
        .orderBy('comments.created', 'asc')
        .execute()

      // never ship the password hash in a downloadable archive
      const { passwordHash: _passwordHash, ...profile } = user
      const entries: Zippable = {
        'profile.json': strToU8(JSON.stringify(profile, null, 2)),
        'posts.ndjson': strToU8(posts.map((post) => JSON.stringify(post)).join('\n')),
        'comments.ndjson': strToU8(comments.map((comment) => JSON.stringify(comment)).join('\n'))
      }
      const imagePrefix = `${userUid}/`
      const [imageFiles] = await bucket.getFiles({ prefix: imagePrefix })
      for (const imageFile of imageFiles) {
        const [contents] = await imageFile.download()
        // jpegs are already compressed — store, don't deflate
        entries[`images/${imageFile.name.slice(imagePrefix.length)}`] = [new Uint8Array(contents), { level: 0 }]
      }

      // async zip compresses on worker threads so a large export doesn't block the event loop
      const zipped = await new Promise<Uint8Array>((resolve, reject) => {
        zip(entries, (err, data) => (err ? reject(err) : resolve(data)))
      })
      await zipFile.save(Buffer.from(zipped), { metadata: { contentType: 'application/zip' } })
      this.logger.info(
        { userUid, zipPath, posts: posts.length, comments: comments.length, images: imageFiles.length },
        'User data exported'
      )
      return new URL(zipPath, this.baseImageUrl).href
    } catch (error) {
      if (error instanceof UserDataError) throw error
      logError(this.logger, error, 'Error exporting user data')
      throw new Error('An unexpected error occurred while exporting user data.')
    }
  }

  async deleteUserData(userUid: string) {
    this.logger.info({ userUid }, 'Hard-deleting all user data')
    try {
      await this.db.transaction().execute(async (trx) => {
        const user = await trx.selectFrom('users').select('id').where('uid', '=', userUid).executeTakeFirst()
        if (user == null) throw new UserDataError('User not found', { user: ['User not found'] })

        // Other users keep denormalized uid lists in users.info — scrub this user out of them first
        const favoritedBy = trx.selectFrom('favorites').select('userUid').where('friendUid', '=', userUid)
        const relatedBy = trx.selectFrom('relations').select('userUid').where('friendUid', '=', userUid)
        const affected = await trx
          .selectFrom('users')
          .select(['uid', 'info'])
          .where((eb) => eb.or([eb('uid', 'in', favoritedBy), eb('uid', 'in', relatedBy)]))
          .execute()
        for (const { uid, info } of affected) {
          const current = info as DenormalizedInfo
          const cleaned = {
            ...current,
            favorites: (current.favorites ?? []).filter((favoriteUid) => favoriteUid !== userUid),
            relations: {
              approved: (current.relations?.approved ?? []).filter((approvedUid) => approvedUid !== userUid),
              disapproved: (current.relations?.disapproved ?? []).filter((disapprovedUid) => disapprovedUid !== userUid)
            }
          }
          await trx.updateTable('users').set({ info: cleaned }).where('uid', '=', uid).execute()
        }

        // FK order: children first (mirrors scripts/unseed-fake-data.ts)
        // Comments the user wrote anywhere, plus comments others left on the user's posts
        await trx
          .deleteFrom('comments')
          .where((eb) =>
            eb.or([
              eb('userUid', '=', userUid),
              eb('postId', 'in', trx.selectFrom('posts').select('id').where('userUid', '=', userUid))
            ])
          )
          .execute()
        await trx.deleteFrom('postTargets').where('userUid', '=', userUid).execute()
        await trx
          .deleteFrom('favorites')
          .where((eb) => eb.or([eb('userUid', '=', userUid), eb('friendUid', '=', userUid)]))
          .execute()
        await trx
          .deleteFrom('relations')
          .where((eb) => eb.or([eb('userUid', '=', userUid), eb('friendUid', '=', userUid)]))
          .execute()
        await trx.deleteFrom('posts').where('userUid', '=', userUid).execute()
        await trx.deleteFrom('accountValidationTokens').where('userId', '=', user.id).execute()
        await trx.deleteFrom('passwordRecoveryTokens').where('userId', '=', user.id).execute()
        await trx.deleteFrom('users').where('uid', '=', userUid).execute()
      })

      // GCS can't join the transaction, so images go after the DB commit: the user's
      // uploaded images plus any data-export zips (they contain everything above)
      const bucket = this.storage.bucket(this.imageBucket)
      await bucket.deleteFiles({ prefix: `${userUid}/`, force: true })
      await bucket.deleteFiles({ prefix: 'user_data/', matchGlob: `user_data/dt=*/${userUid}_data.zip`, force: true })
      this.logger.info({ userUid }, 'User data deleted')
    } catch (error) {
      if (error instanceof UserDataError) throw error
      logError(this.logger, error, 'Error deleting user data')
      throw new Error('An unexpected error occurred while deleting user data.')
    }
  }
}
