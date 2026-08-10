import CommentForm from '@components/post/comment-form'
import PostForm, { createStatusOptions, editStatusOptions } from '@components/post/post-form'
import EditPostPage from '@pages/post/edit'
import NewPostPage from '@pages/post/new'
import PostViewPage, { type PostComment } from '@pages/post/view'
import type { Context, Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { Logger } from 'pino'
import Uniquey from 'uniquey'
import { z } from 'zod'
import * as m from '@/middleware'
import * as utils from '@/utils'
import { moderateFields, validateAndUploadImage } from './form-helpers'

const uidUniquey = new Uniquey() // short by design: public uid, not a secret

const COMMENT_LIMIT = 30

const sharedPostFields = {
  content: z.string().trim().min(1, 'Post text is required.').max(500, 'Post text must be at most 500 characters long.'),
  // protocol-restricted: a stored javascript:/data: URL would render as a clickable link for other users
  linkUrl: z
    .union([z.literal(''), z.url({ protocol: /^https?$/, error: 'Link URL must be a valid http or https URL.' })])
    .optional(),
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

const commentSchema = z.object({
  content: z.string().trim().min(1, 'Comment text is required.').max(200, 'Comments must be at most 200 characters long.')
})
type CommentFormData = z.infer<typeof commentSchema>

const postTextFields = ['content', 'linkText'] as const
const postFormFields = ['content', 'linkUrl', 'linkText', 'status', 'audience'] as const

// typed field values fed back into the form components on an error re-render
type PostFormValues = Partial<Record<(typeof postFormFields)[number], string>>
type PostFormRerender = (
  values: PostFormValues,
  errors: Record<string, string[]>,
  imageDroppedNote: boolean
) => Response | Promise<Response>

// shared parse → validate → moderate → upload pipeline for create and edit (see form-helpers.ts).
// returns the re-rendered form response on any failure, or the validated fields plus any freshly uploaded image URL
async function processPostForm(
  c: Context,
  userUid: string,
  schema: z.ZodType<PostFormData>,
  rerender: PostFormRerender
): Promise<{ response: Response } | { data: PostFormData; uploadedImageUrl: string | undefined }> {
  const { logger, api } = c.var
  const formData = await c.req.formData()
  const form: Record<string, string> = {}
  for (const field of postFormFields) {
    const value = formData.get(field)
    if (typeof value === 'string') form[field] = value
  }
  // browsers can't restore a picked file into a re-rendered form, so failures unrelated to the
  // image carry a visible "re-select your photo" note
  const image = formData.get('image')
  const hadImage = image instanceof File && image.size > 0
  const fail = async (values: PostFormValues, errors: Record<string, string[]>) => ({
    response: await rerender(values, errors, hadImage && !errors.image)
  })

  const result = utils.validateFormData<PostFormData>(form, schema)
  if (!result.success) {
    logger.warn({ errors: result.errors }, 'Validation errors on post form')
    return fail(form, result.errors)
  }
  const { data } = result

  const moderationErrors = await moderateFields(api, logger, data, postTextFields)
  if (moderationErrors) return fail(data, moderationErrors)

  const upload = await validateAndUploadImage(c, formData, { userUid, filenamePrefix: 'post', maxDimension: 1280 })
  if ('errors' in upload) return fail(data, upload.errors)

  return { data, uploadedImageUrl: upload.url }
}

// edit/delete carry the validated origin page in their action query string so error re-renders
// (fragment and full-page) keep it without a hidden field
const withReturn = (path: string, returnTo: string | undefined) =>
  returnTo ? `${path}?return=${encodeURIComponent(returnTo)}` : path

// a post you can view: published, by an active author, and the viewer is the author or in the
// post's audience (utils.audienceAllows); anything else is a 404
async function loadVisiblePost(c: Context, viewerUid: string) {
  const uid = c.req.param('uid')
  if (uid == null) throw new HTTPException(404, { message: 'Post not found' })
  const post = await c.var.db
    .selectFrom('posts')
    .innerJoin('users', 'users.uid', 'posts.userUid')
    .leftJoin('postTargets', 'postTargets.postId', 'posts.id')
    .select([
      'posts.id',
      'posts.uid',
      'posts.content',
      'posts.imageUrl',
      'posts.linkUrl',
      'posts.linkText',
      'posts.created',
      'posts.updated',
      'users.uid as authorUid',
      'users.username as authorUsername',
      'users.info as authorInfo'
    ])
    .where('posts.uid', '=', uid)
    .where('posts.status', '=', 'published')
    .where('users.status', '=', 'active')
    .where((eb) => eb.or([eb('posts.userUid', '=', viewerUid), utils.audienceAllows(eb, viewerUid)]))
    .executeTakeFirst()
  if (post == null) throw new HTTPException(404, { message: 'Post not found' })
  return post
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

    // HTMX failures re-render the form fragment; no-JS failures re-render the full page (mirrors GET /posts/new)
    const rerender: PostFormRerender = (values, errors, imageDroppedNote) =>
      utils.formErrorResponse(
        c,
        PostForm({
          ...values,
          action: '/posts/new',
          submitLabel: 'Create Post',
          statusOptions: createStatusOptions,
          errors,
          imageDroppedNote
        }),
        NewPostPage({ ...values, errors, imageDroppedNote }),
        { title: 'New Post', description: 'Create a new post.', styles: ['auth'] }
      )
    const result = await processPostForm(c, user.uid, createPostSchema, rerender)
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
    // a published post has a page to land on; a draft does not, so it goes to the profile
    return utils.redirect(c, data.status === 'draft' ? `/profile/${user.uid}` : `/posts/${postUid}`)
  })

  posts.get('/:uid/edit', async (c) => {
    const { auth, db } = c.var
    const user = await auth.getUser()
    if (user == null) throw new HTTPException(401) // this should never happen due to the authorize middleware
    const post = await loadOwnPost(c, user.uid)
    const returnTo = utils.safeReturnPath(c.req.query('return'))
    const target = await db.selectFrom('postTargets').select(['type']).where('postId', '=', post.id).executeTakeFirst()
    return c.render(
      EditPostPage({
        uid: post.uid,
        returnTo,
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
        styles: ['auth']
      }
    )
  })

  posts.post('/:uid/edit', async (c) => {
    const { logger, flash, auth, db } = c.var
    const user = await auth.getUser()
    if (user == null) throw new HTTPException(401) // this should never happen due to the authorize middleware
    const post = await loadOwnPost(c, user.uid)
    const returnTo = utils.safeReturnPath(c.req.query('return'))

    // HTMX failures re-render the form fragment (keeping the Delete Post trigger — the confirm dialog
    // itself is outside the swap); no-JS failures re-render the full page (mirrors GET /posts/:uid/edit)
    const rerender: PostFormRerender = (values, errors, imageDroppedNote) =>
      utils.formErrorResponse(
        c,
        PostForm({
          ...values,
          action: withReturn(`/posts/${post.uid}/edit`, returnTo),
          submitLabel: 'Save Post',
          statusOptions: editStatusOptions(post.status),
          imageUrl: post.imageUrl ?? undefined,
          showDelete: true,
          errors,
          imageDroppedNote
        }),
        EditPostPage({
          uid: post.uid,
          returnTo,
          ...values,
          statusOptions: editStatusOptions(post.status),
          imageUrl: post.imageUrl ?? undefined,
          errors,
          imageDroppedNote
        }),
        { title: 'Edit Post', description: 'Edit your post.', styles: ['auth'] }
      )
    const result = await processPostForm(c, user.uid, editPostSchema, rerender)
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
    return utils.redirect(c, returnTo ?? `/profile/${user.uid}`)
  })

  posts.post('/:uid/delete', async (c) => {
    const { logger, flash, auth, db } = c.var
    const user = await auth.getUser()
    if (user == null) throw new HTTPException(401) // this should never happen due to the authorize middleware
    const post = await loadOwnPost(c, user.uid)
    const returnTo = utils.safeReturnPath(c.req.query('return'))

    await db.updateTable('posts').set({ status: 'deleted', updated: new Date() }).where('id', '=', post.id).execute()

    logger.info({ uid: user.uid, postUid: post.uid }, 'Post deleted')
    await flash.addFlash('success', 'Post deleted.')
    return utils.redirect(c, returnTo ?? `/profile/${user.uid}`)
  })

  // the full post page; also re-rendered (with commentForm values/errors) when a no-JS comment submit fails
  async function renderPostView(
    c: Context,
    post: Awaited<ReturnType<typeof loadVisiblePost>>,
    commentForm?: { content?: string; errors?: Record<string, string[]> }
  ) {
    const { db, config } = c.var
    const commentRows = await db
      .selectFrom('comments')
      .innerJoin('users', 'users.uid', 'comments.userUid')
      .select([
        'comments.uid as uid',
        'comments.content as content',
        'comments.created as created',
        'users.uid as authorUid',
        'users.username as authorUsername',
        'users.info as authorInfo'
      ])
      .where('comments.postId', '=', post.id)
      // id breaks ties so comments created in the same instant keep a stable order
      .orderBy('comments.created', 'asc')
      .orderBy('comments.id', 'asc')
      .limit(COMMENT_LIMIT)
      .execute()

    const authorInfo = post.authorInfo
    const authorName = authorInfo.fullname ?? post.authorUsername
    const comments: PostComment[] = commentRows.map((row) => {
      const info = row.authorInfo
      return {
        uid: row.uid,
        content: row.content,
        created: row.created,
        author: {
          uid: row.authorUid,
          name: info.fullname ?? row.authorUsername,
          imageUrl: utils.displayImageUrl(info, config.baseImageUrl)
        }
      }
    })

    return c.render(
      PostViewPage({
        post: {
          uid: post.uid,
          content: post.content,
          imageUrl: post.imageUrl,
          linkUrl: post.linkUrl,
          linkText: post.linkText,
          created: post.created,
          updated: post.updated,
          author: { uid: post.authorUid, name: authorName, imageUrl: utils.displayImageUrl(authorInfo, config.baseImageUrl) }
        },
        comments,
        // the row query already stops at the cap, so a full page means the limit is reached
        commentLimitReached: commentRows.length === COMMENT_LIMIT,
        commentForm
      }),
      {
        title: `Post by ${authorName}`,
        description: `A post by ${authorName} and its comments.`,
        styles: ['profile', 'home', 'auth', 'post']
      }
    )
  }

  posts.get('/:uid', async (c) => {
    const viewerUid = c.var.auth.user?.uid
    if (viewerUid == null) throw new HTTPException(401) // this should never happen due to the authorize middleware
    const post = await loadVisiblePost(c, viewerUid)
    return renderPostView(c, post)
  })

  posts.post('/:uid/comments', async (c) => {
    const { logger, flash, auth, db, api } = c.var
    const user = await auth.getUser()
    if (user == null) throw new HTTPException(401) // this should never happen due to the authorize middleware
    const post = await loadVisiblePost(c, user.uid)

    const formData = await c.req.formData()
    const contentValue = formData.get('content')
    const form = { content: typeof contentValue === 'string' ? contentValue : '' }
    // HTMX failures re-render the form fragment; no-JS failures re-render the full post page
    // (built here rather than via utils.formErrorResponse since the page needs the comment queries)
    const rerender = (content: string | undefined, errors: Record<string, string[]>) => {
      if (c.req.header('HX-Request') === 'true') return c.html(CommentForm({ postUid: post.uid, content, errors }))
      return renderPostView(c, post, { content, errors })
    }

    const result = utils.validateFormData<CommentFormData>(form, commentSchema)
    if (!result.success) {
      logger.warn({ errors: result.errors }, 'Validation errors on comment form')
      return rerender(form.content, result.errors as Record<string, string[]>)
    }
    const { content } = result.data

    // a moderation outage fails closed (form-level error) rather than letting unchecked text through
    try {
      const flags = await api.language.getContentFlags(content)
      if (flags.length > 0) {
        logger.warn({ uid: user.uid, postUid: post.uid }, 'Comment text flagged by moderation')
        return rerender(content, { content: ['This text appears to contain inappropriate content.'] })
      }
    } catch (error) {
      utils.logError(logger, error, 'Error moderating comment text')
      return rerender(content, { form: ["We couldn't check your text right now. Please try again."] })
    }

    // count-then-insert inside a transaction that locks the post row, so concurrent submissions
    // serialize per post and the cap cannot be exceeded by a race
    const commentUid = uidUniquey.create()
    const inserted = await db.transaction().execute(async (trx) => {
      await trx.selectFrom('posts').select('id').where('id', '=', post.id).forUpdate().executeTakeFirst()
      const countRow = await trx
        .selectFrom('comments')
        .select((eb) => eb.fn.countAll<number>().as('total'))
        .where('postId', '=', post.id)
        .executeTakeFirst()
      if (Number(countRow?.total ?? 0) >= COMMENT_LIMIT) return false
      await trx
        .insertInto('comments')
        .values({ uid: commentUid, postId: post.id, userId: user.id, userUid: user.uid, content })
        .execute()
      return true
    })
    if (!inserted) {
      return rerender(content, { form: ['This post has reached its comment limit.'] })
    }

    logger.info({ uid: user.uid, postUid: post.uid }, 'Comment added')
    await flash.addFlash('success', 'Comment added.')
    // refresh: the viewer is already on this page, so a hash-only HX-Redirect would not reload
    return utils.redirect(c, `/posts/${post.uid}#comment-${commentUid}`, { refresh: true })
  })
}
