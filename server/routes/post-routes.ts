import { ImageUploadError } from '@api/image-api'
import PostForm, { createStatusOptions, editStatusOptions, type StatusOption } from '@components/post/post-form'
import EditPostPage from '@pages/post/edit'
import NewPostPage from '@pages/post/new'
import type { Context, Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { Logger } from 'pino'
import Uniquey from 'uniquey'
import { z } from 'zod'
import * as m from '@/middleware'
import * as utils from '@/utils'

const uidUniquey = new Uniquey() // short by design: public uid, not a secret
// each upload gets a fresh filename so cached URLs never go stale
const imageUniquey = new Uniquey({ length: 8 })

const MAX_IMAGE_BYTES = 20 * 1024 * 1024
// formats Jimp can decode; keep in sync with the accept attribute and hint in the post form
const allowedImageTypes = ['image/jpeg', 'image/png', 'image/gif']

const sharedPostFields = {
  content: z.string().trim().min(1, 'Post text is required.').max(500, 'Post text must be at most 500 characters long.'),
  linkUrl: z.union([z.literal(''), z.url('Link URL must be a valid URL.')]).optional(),
  linkText: z.string().trim().max(100, 'Link text must be at most 100 characters long.').optional(),
  audience: z.enum(['all', 'non_disapproved', 'approved', 'favorites'], { error: 'Please pick a valid audience.' })
}

// creation only chooses between draft and published; editing can also archive or delete
const createPostSchema = z.object({
  ...sharedPostFields,
  status: z.enum(['draft', 'published'], { error: 'Status must be draft or published.' })
})
const editPostSchema = z.object({
  ...sharedPostFields,
  // deletion is not a form status; it goes through the confirmed POST /posts/:uid/delete
  status: z.enum(['draft', 'published', 'archived'], { error: 'Please pick a valid status.' })
})

type PostFormData = z.infer<typeof editPostSchema>

const postTextFields = ['content', 'linkText'] as const
const postFormFields = ['content', 'linkUrl', 'linkText', 'status', 'audience'] as const

// how the shared form is addressed and labeled when it re-renders with errors
type FormChrome = { action: string; submitLabel: string; statusOptions: StatusOption[]; imageUrl?: string; showDelete?: boolean }

// shared parse → validate → moderate → upload pipeline for create and edit.
// returns the re-rendered form response on any failure, or the validated fields plus any freshly uploaded image URL
async function processPostForm(
  c: Context,
  userUid: string,
  schema: z.ZodType<PostFormData>,
  chrome: FormChrome
): Promise<{ response: Response } | { data: PostFormData; uploadedImageUrl: string | undefined }> {
  const { logger, api } = c.var
  const formData = await c.req.formData()
  const form: Record<string, string> = {}
  for (const field of postFormFields) {
    const value = formData.get(field)
    if (typeof value === 'string') form[field] = value
  }
  const rerender = async (values: Record<string, string | undefined>, errors: Record<string, string[]>) => ({
    response: await c.html(PostForm({ ...values, ...chrome, errors }))
  })

  const result = utils.validateFormData<PostFormData>(form, schema)
  if (!result.success) {
    logger.warn({ errors: result.errors }, 'Validation errors on post form')
    return rerender(form, result.errors)
  }
  const { data } = result

  // moderate every non-empty text field; a flagged field blocks the save with an error on that field.
  // a moderation outage fails closed (form-level error) rather than letting unchecked text through
  try {
    const flagged = await Promise.all(
      postTextFields
        .filter((field) => data[field])
        .map(async (field) => [field, await api.language.getContentFlags(data[field] as string)] as const)
    )
    const errors: Record<string, string[]> = {}
    for (const [field, flags] of flagged) {
      if (flags.length > 0) errors[field] = ['This text appears to contain inappropriate content.']
    }
    if (Object.keys(errors).length > 0) {
      logger.warn({ uid: userUid, fields: Object.keys(errors) }, 'Post text flagged by moderation')
      return rerender(data, errors)
    }
  } catch (error) {
    utils.logError(logger, error, 'Error moderating post text')
    return rerender(data, { form: ["We couldn't check your text right now. Please try again."] })
  }

  const image = formData.get('image')
  let uploadedImageUrl: string | undefined
  if (image instanceof File && image.size > 0) {
    if (image.size > MAX_IMAGE_BYTES) {
      return rerender(data, { image: ['Image is too large. The maximum size is 20MB.'] })
    }
    if (!allowedImageTypes.includes(image.type)) {
      return rerender(data, { image: ['Image must be a JPEG, PNG, or GIF.'] })
    }
    try {
      uploadedImageUrl = await api.images.uploadImage({
        userUid,
        buffer: Buffer.from(await image.arrayBuffer()),
        filename: `post-${imageUniquey.create()}`,
        mimetype: 'image/jpeg',
        maxDimension: 1280
      })
    } catch (error) {
      const errors =
        error instanceof ImageUploadError ? error.errors : { image: ["We couldn't upload your image. Please try again."] }
      return rerender(data, errors)
    }
  }

  return { data, uploadedImageUrl }
}

// a post you can edit: yours and not deleted
async function loadOwnPost(c: Context, userUid: string) {
  const uid = c.req.param('uid')
  if (uid == null) throw new HTTPException(404, { message: 'Post not found' })
  const post = await c.var.db
    .selectFrom('posts')
    .select(['id', 'uid', 'content', 'imageUrl', 'linkUrl', 'linkText', 'status'])
    .where('uid', '=', uid)
    .where('userUid', '=', userUid)
    .where('status', '!=', 'deleted')
    .executeTakeFirst()
  if (post == null) throw new HTTPException(404, { message: 'Post not found' })
  return post
}

export default function PostRoutes(app: Hono, logger: Logger) {
  logger.info('Registering post routes')
  const posts = app.basePath('/posts')
  posts.use('*', m.authorize({ requireAuth: true }))

  posts.get('/new', async (c) => {
    return c.render(NewPostPage(), {
      title: 'New Post',
      description: 'Create a new post.',
      styles: ['auth']
    })
  })

  posts.post('/new', async (c) => {
    const { logger, flash, auth, db } = c.var
    const user = await auth.getUser()
    if (user == null) throw new HTTPException(401) // this should never happen due to the authorize middleware

    const result = await processPostForm(c, user.uid, createPostSchema, {
      action: '/posts/new',
      submitLabel: 'Create Post',
      statusOptions: createStatusOptions
    })
    if ('response' in result) return result.response
    const { data, uploadedImageUrl } = result

    // the post and its audience row land together or not at all
    const postUid = uidUniquey.create()
    await db.transaction().execute(async (trx) => {
      const post = await trx
        .insertInto('posts')
        .values({
          uid: postUid,
          userId: user.id,
          userUid: user.uid,
          content: data.content,
          imageUrl: uploadedImageUrl,
          linkUrl: data.linkUrl || undefined,
          linkText: data.linkText || undefined,
          status: data.status
        })
        .returning(['id', 'uid'])
        .executeTakeFirstOrThrow()
      await trx
        .insertInto('postTargets')
        .values({ postId: post.id, postUid: post.uid, userId: user.id, userUid: user.uid, type: data.audience })
        .execute()
    })

    logger.info({ uid: user.uid, postUid, status: data.status, audience: data.audience }, 'Post created')
    await flash.addFlash('success', data.status === 'draft' ? 'Draft saved.' : 'Post created.')
    return utils.redirect(c, `/profile/${user.uid}`)
  })

  posts.get('/:uid/edit', async (c) => {
    const { auth, db } = c.var
    const user = await auth.getUser()
    if (user == null) throw new HTTPException(401) // this should never happen due to the authorize middleware
    const post = await loadOwnPost(c, user.uid)
    const target = await db.selectFrom('postTargets').select(['type']).where('postId', '=', post.id).executeTakeFirst()
    return c.render(
      EditPostPage({
        uid: post.uid,
        statusOptions: editStatusOptions(post.status),
        content: post.content,
        imageUrl: post.imageUrl ?? undefined,
        linkUrl: post.linkUrl ?? undefined,
        linkText: post.linkText ?? undefined,
        status: post.status,
        audience: target?.type ?? 'all'
      }),
      {
        title: 'Edit Post',
        description: 'Edit your post.',
        // 'user' carries the shared delete-modal styling
        styles: ['user', 'auth']
      }
    )
  })

  posts.post('/:uid/edit', async (c) => {
    const { logger, flash, auth, db } = c.var
    const user = await auth.getUser()
    if (user == null) throw new HTTPException(401) // this should never happen due to the authorize middleware
    const post = await loadOwnPost(c, user.uid)

    const result = await processPostForm(c, user.uid, editPostSchema, {
      action: `/posts/${post.uid}/edit`,
      submitLabel: 'Save Post',
      statusOptions: editStatusOptions(post.status),
      imageUrl: post.imageUrl ?? undefined,
      // keeps the Delete Post trigger on error re-renders (the confirm dialog itself is outside the swap)
      showDelete: true
    })
    if ('response' in result) return result.response
    const { data, uploadedImageUrl } = result

    await db.transaction().execute(async (trx) => {
      await trx
        .updateTable('posts')
        .set({
          content: data.content,
          // a new upload replaces the photo; otherwise the stored one is kept (there is no remove-photo control yet)
          imageUrl: uploadedImageUrl ?? post.imageUrl,
          linkUrl: data.linkUrl || null,
          linkText: data.linkText || null,
          status: data.status,
          // bumped explicitly so the profile's (edited) marker works without relying on a database trigger
          updated: new Date()
        })
        .where('id', '=', post.id)
        .execute()
      const updated = await trx
        .updateTable('postTargets')
        .set({ type: data.audience })
        .where('postId', '=', post.id)
        .executeTakeFirst()
      // posts created before audience rows existed get one on their first edit
      if (updated.numUpdatedRows === 0n) {
        await trx
          .insertInto('postTargets')
          .values({ postId: post.id, postUid: post.uid, userId: user.id, userUid: user.uid, type: data.audience })
          .execute()
      }
    })

    logger.info({ uid: user.uid, postUid: post.uid, status: data.status, audience: data.audience }, 'Post updated')
    await flash.addFlash('success', data.status === 'archived' ? 'Post archived.' : 'Post updated.')
    return utils.redirect(c, `/profile/${user.uid}`)
  })

  posts.post('/:uid/delete', async (c) => {
    const { logger, flash, auth, db } = c.var
    const user = await auth.getUser()
    if (user == null) throw new HTTPException(401) // this should never happen due to the authorize middleware
    const post = await loadOwnPost(c, user.uid)

    await db.updateTable('posts').set({ status: 'deleted', updated: new Date() }).where('id', '=', post.id).execute()

    logger.info({ uid: user.uid, postUid: post.uid }, 'Post deleted')
    await flash.addFlash('success', 'Post deleted.')
    return utils.redirect(c, `/profile/${user.uid}`)
  })
}
