import { Readable } from 'node:stream'
import type data from '@data/index'
import { Storage } from '@google-cloud/storage'
import * as DateFns from 'date-fns'
import { strToU8, type Zippable, zip } from 'fflate'
import type { Logger } from 'pino'
import Uniquey from 'uniquey'
import type { Config } from '@/config'
import { logError } from '@/utils'

// the bucket is private — archives are served through the authenticated /user/data download
// route. The random token still keeps the object path unguessable (legacy public zips with
// the old predictable uid+date path may linger until the daily-export cleanup removes them).
const exportUniquey = new Uniquey({ length: 32 })

// matches this user's export objects in both the current tokened format
// (dt=.../<token>_<uid>_data.zip) and the legacy predictable format (dt=.../<uid>_data.zip)
function isExportFor(name: string, userUid: string) {
  return name.endsWith(`_${userUid}_data.zip`) || name.endsWith(`/${userUid}_data.zip`)
}

export class UserDataError extends Error {
  constructor(
    message: string,
    public readonly errors: Record<string, string[]> = {}
  ) {
    super(message)
    this.name = 'UserDataError'
  }
}

// keep a large export from hammering GCS (or stalling on one file at a time)
const IMAGE_DOWNLOAD_CONCURRENCY = 4

export default class UserDataAPI {
  private readonly logger: Logger
  private readonly storage: Storage
  private readonly dataBucket: string
  private readonly imageBucket: string
  private readonly baseUrl: string

  constructor(
    private readonly db: ReturnType<typeof data>,
    config: Config,
    _logger: Logger
  ) {
    this.logger = _logger.child({ module: 'user-data-api' })
    this.storage = new Storage()
    this.dataBucket = config.buckets.data
    this.imageBucket = config.buckets.image
    this.baseUrl = config.baseLinkUrl.endsWith('/') ? config.baseLinkUrl : `${config.baseLinkUrl}/`
    this.logger.info('UserDataAPI initialized')
  }

  async downloadUserData(userUid: string) {
    this.logger.info({ userUid }, 'Exporting user data')
    try {
      const user = await this.db.selectFrom('users').selectAll().where('uid', '=', userUid).executeTakeFirst()
      if (user == null) throw new UserDataError('User not found', { user: ['User not found'] })

      const dateStamp = DateFns.format(new Date(), 'yyyy-MM-dd')
      const zipPath = `user_data/dt=${dateStamp}/${exportUniquey.create()}_${userUid}_data.zip`
      const bucket = this.storage.bucket(this.dataBucket)
      const zipFile = bucket.file(zipPath)

      // one listing serves the once-a-day check and the cleanup of older exports (including
      // any lingering legacy predictable-path zips, which are publicly enumerable)
      const [exportFiles] = await bucket.getFiles({ prefix: 'user_data/' })
      const previousExports = exportFiles.filter((file) => isExportFor(file.name, userUid))
      if (previousExports.some((file) => file.name.startsWith(`user_data/dt=${dateStamp}/`))) {
        const message = 'You already exported your data today. You can only do it once a day.'
        throw new UserDataError(message, { export: [message] })
      }
      await Promise.all(previousExports.map((file) => file.delete()))

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
      // uploaded images live in the image bucket (see ImagesAPI), not the data bucket
      const imagePrefix = `${userUid}/`
      const [imageFiles] = await this.storage.bucket(this.imageBucket).getFiles({ prefix: imagePrefix })
      // bounded concurrency: download in chunks of IMAGE_DOWNLOAD_CONCURRENCY
      for (let i = 0; i < imageFiles.length; i += IMAGE_DOWNLOAD_CONCURRENCY) {
        await Promise.all(
          imageFiles.slice(i, i + IMAGE_DOWNLOAD_CONCURRENCY).map(async (imageFile) => {
            const [contents] = await imageFile.download()
            // jpegs are already compressed — store, don't deflate
            entries[`images/${imageFile.name.slice(imagePrefix.length)}`] = [new Uint8Array(contents), { level: 0 }]
          })
        )
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
      return new URL(`user/data/${zipPath}`, this.baseUrl).href
    } catch (error) {
      if (error instanceof UserDataError) throw error
      logError(this.logger, error, 'Error exporting user data')
      throw new Error('An unexpected error occurred while exporting user data.')
    }
  }

  // streams a stored export for the download route. Returns null when the object doesn't
  // exist or isn't this user's — the route 404s both identically (no existence leak)
  async getExportStream(userUid: string, zipPath: string) {
    if (!isExportFor(zipPath, userUid)) return null
    try {
      const file = this.storage.bucket(this.dataBucket).file(zipPath)
      const [metadata] = await file.getMetadata()
      return {
        stream: Readable.toWeb(file.createReadStream()) as ReadableStream<Uint8Array>,
        size: Number(metadata.size)
      }
    } catch (error) {
      if ((error as { code?: number }).code === 404) return null
      logError(this.logger, error, 'Error streaming user data export')
      throw new Error('An unexpected error occurred while downloading user data.')
    }
  }

  async deleteUserData(userUid: string) {
    this.logger.info({ userUid }, 'Hard-deleting all user data')
    try {
      await this.db.transaction().execute(async (trx) => {
        const user = await trx.selectFrom('users').select('id').where('uid', '=', userUid).executeTakeFirst()
        if (user == null) throw new UserDataError('User not found', { user: ['User not found'] })

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
      // uploaded images (image bucket) plus any data-export zips (data bucket — they
      // contain everything above)
      await this.storage.bucket(this.imageBucket).deleteFiles({ prefix: `${userUid}/`, force: true })
      // `*` may be empty, so this matches both the tokened and legacy export filenames
      await this.storage
        .bucket(this.dataBucket)
        .deleteFiles({ prefix: 'user_data/', matchGlob: `user_data/dt=*/*${userUid}_data.zip`, force: true })
      this.logger.info({ userUid }, 'User data deleted')
    } catch (error) {
      if (error instanceof UserDataError) throw error
      logError(this.logger, error, 'Error deleting user data')
      throw new Error('An unexpected error occurred while deleting user data.')
    }
  }
}
