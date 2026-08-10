import { ImageUploadError } from '@api/image-api'
import type API from '@api/index'
import type { Context } from 'hono'
import type { PinoLogger } from 'hono-pino'
import Uniquey from 'uniquey'
import * as utils from '@/utils'

// shared moderation/upload pipeline for the post and edit-profile forms. These helpers stay at the
// route layer on purpose: sub-API classes (ImagesAPI/LanguageAPI) must not absorb cross-domain
// orchestration — routes decide how moderation and upload results map onto form errors.

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024
// formats Jimp can decode; keep in sync with the accept attribute and hint in the post/edit-profile forms
export const allowedImageTypes = ['image/jpeg', 'image/png', 'image/gif']

// each upload gets a fresh filename so cached URLs never go stale
const imageUniquey = new Uniquey({ length: 8 })

// moderates every non-empty text field; a flagged field gets a per-field error. A moderation outage
// fails closed (form-level error) rather than letting unchecked text through. Returns null when clean
export async function moderateFields<T>(
  api: API,
  logger: PinoLogger,
  data: T,
  fields: readonly (keyof T & string)[]
): Promise<Record<string, string[]> | null> {
  try {
    const flagged = await Promise.all(
      fields
        .filter((field) => data[field])
        .map(async (field) => [field, await api.language.getContentFlags(data[field] as string)] as const)
    )
    const errors: Record<string, string[]> = {}
    for (const [field, flags] of flagged) {
      if (flags.length > 0) errors[field] = ['This text appears to contain inappropriate content.']
    }
    if (Object.keys(errors).length > 0) {
      logger.warn({ fields: Object.keys(errors) }, 'Form text flagged by moderation')
      return errors
    }
    return null
  } catch (error) {
    utils.logError(logger, error, 'Error moderating form text')
    return { form: ["We couldn't check your text right now. Please try again."] }
  }
}

// size/type-checks the form's `image` file (when present) and uploads it, mapping upload failures
// to field errors. `url` is undefined when no file was submitted
export async function validateAndUploadImage(
  c: Context,
  formData: FormData,
  options: { userUid: string; filenamePrefix: string; maxDimension: number; removePrefix?: string }
): Promise<{ url: string | undefined } | { errors: Record<string, string[]> }> {
  const image = formData.get('image')
  if (!(image instanceof File) || image.size === 0) return { url: undefined }
  if (image.size > MAX_IMAGE_BYTES) {
    return { errors: { image: ['Image is too large. The maximum size is 20MB.'] } }
  }
  if (!allowedImageTypes.includes(image.type)) {
    return { errors: { image: ['Image must be a JPEG, PNG, or GIF.'] } }
  }
  try {
    const url = await c.var.api.images.uploadImage({
      userUid: options.userUid,
      buffer: Buffer.from(await image.arrayBuffer()),
      filename: `${options.filenamePrefix}-${imageUniquey.create()}`,
      mimetype: 'image/jpeg',
      maxDimension: options.maxDimension,
      removePrefix: options.removePrefix
    })
    return { url }
  } catch (error) {
    if (error instanceof ImageUploadError) return { errors: error.errors }
    return { errors: { image: ["We couldn't upload your image. Please try again."] } }
  }
}
