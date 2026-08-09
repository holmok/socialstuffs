import { Storage } from '@google-cloud/storage'
import Vision from '@google-cloud/vision'
import { Jimp } from 'jimp'
import type { Logger } from 'pino'
import type { Config } from '@/config'
import { logError } from '@/utils'

export class ImageUploadError extends Error {
  errors: Record<string, string[]>
  constructor(message: string, errors: Record<string, string[]>) {
    super(message)
    this.errors = errors
  }
}
export type ImageUploadOptions = {
  userUid: string
  buffer: Buffer
  filename: string
  mimetype: 'image/jpeg'
  maxDimension: number
  removePrefix?: string
}

const badLikelihoods = ['LIKELY', 'VERY_LIKELY']

async function isUnacceptable(buffer: Buffer, logger: Logger) {
  const visionClient = new Vision.ImageAnnotatorClient()
  const [results] = await visionClient.safeSearchDetection(buffer)
  const detections = results.safeSearchAnnotation
  if (detections == null) return false // If we can't get a result, we should probably allow the image rather than block it
  const { adult, violence, racy } = detections
  logger.debug({ adult, violence, racy }, 'Image content analysis results')
  const hasUnacceptableContent = [adult, violence, racy].some((likelihood) => {
    return badLikelihoods.includes(likelihood as string)
  })
  logger.debug({ hasUnacceptableContent }, 'Does image have unacceptable content?')
  return hasUnacceptableContent
}

export default class ImagesAPI {
  private readonly logger: Logger
  private readonly storage: Storage
  private readonly imageBucket: string
  private readonly baseImageUrl: string
  constructor(_logger: Logger, config: Config) {
    this.logger = _logger.child({ module: 'ImagesAPI' })
    this.storage = new Storage()
    this.imageBucket = config.imageBucket
    // new URL(path, base) replaces the last segment of a base without a trailing slash,
    // which would silently drop the bucket path from returned URLs
    this.baseImageUrl = config.baseImageUrl.endsWith('/') ? config.baseImageUrl : `${config.baseImageUrl}/`
  }

  async uploadImage(options: ImageUploadOptions) {
    const { userUid, buffer, filename, mimetype, maxDimension, removePrefix } = options
    this.logger.info({ userUid, filename, size: buffer.length }, 'Uploading image')
    try {
      const image = await Jimp.fromBuffer(buffer)
      image.scaleToFit({ w: maxDimension, h: maxDimension })
      const output = await image.getBuffer(mimetype, { quality: 50 })

      const unacceptable = await isUnacceptable(output, this.logger)
      if (unacceptable) {
        this.logger.warn('Image rejected due to unacceptable content')
        throw new ImageUploadError('Image contains unacceptable content and cannot be uploaded.', {
          image: ['Image contains unacceptable content and cannot be uploaded.']
        })
      }

      const bucket = this.storage.bucket(this.imageBucket)
      if (removePrefix != null) {
        const [files] = await bucket.getFiles({ prefix: `${userUid}/${removePrefix}` })
        for (const file of files) {
          await file.delete()
        }
      }

      const file = bucket.file(`${userUid}/${filename}.jpg`)
      await file.save(output, { metadata: { contentType: mimetype } })
      return new URL(`${userUid}/${filename}.jpg`, this.baseImageUrl).href
    } catch (error) {
      logError(this.logger, error, 'Error uploading image')
      if (error instanceof ImageUploadError) {
        throw error
      } else {
        throw new Error('An unexpected error occurred while uploading image.')
      }
    }
  }
}
