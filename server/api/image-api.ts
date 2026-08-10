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

// the 20MB upload cap bounds the *compressed* size only — a small, highly-compressed PNG can
// decode to a multi-GB bitmap. Dimensions are read from the file header and rejected before
// Jimp allocates anything, with a post-decode backstop for files the header scan can't read.
const MAX_IMAGE_DIMENSION = 8000

function oversizeImageError() {
  const message = `Image dimensions are too large. The maximum is ${MAX_IMAGE_DIMENSION}×${MAX_IMAGE_DIMENSION} pixels.`
  return new ImageUploadError(message, { image: [message] })
}

// header-only dimension probe for the three accepted formats; null when unreadable
function headerDimensions(buffer: Buffer): { width: number; height: number } | null {
  // PNG: IHDR width/height at fixed offsets after the 8-byte signature
  if (buffer.length > 24 && buffer.readUInt32BE(0) === 0x89504e47) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
  }
  // GIF: logical screen size at bytes 6-9, little-endian
  if (buffer.length > 10 && buffer.toString('latin1', 0, 3) === 'GIF') {
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) }
  }
  // JPEG: walk the marker segments to the first start-of-frame, which carries height then width
  if (buffer.length > 4 && buffer.readUInt16BE(0) === 0xffd8) {
    let offset = 2
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) return null
      const marker = buffer[offset + 1] as number
      // standalone markers (no length field)
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
        offset += 2
        continue
      }
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) }
      }
      offset += 2 + buffer.readUInt16BE(offset + 2)
    }
  }
  return null
}

async function isUnacceptable(visionClient: InstanceType<typeof Vision.ImageAnnotatorClient>, buffer: Buffer, logger: Logger) {
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
  // one client for the API's lifetime — constructing per upload paid a fresh gRPC channel + auth handshake every call
  private readonly vision: InstanceType<typeof Vision.ImageAnnotatorClient>
  private readonly imageBucket: string
  private readonly baseImageUrl: string
  constructor(_logger: Logger, config: Config) {
    this.logger = _logger.child({ module: 'ImagesAPI' })
    this.storage = new Storage()
    this.vision = new Vision.ImageAnnotatorClient()
    this.imageBucket = config.imageBucket
    // new URL(path, base) replaces the last segment of a base without a trailing slash,
    // which would silently drop the bucket path from returned URLs
    this.baseImageUrl = config.baseImageUrl.endsWith('/') ? config.baseImageUrl : `${config.baseImageUrl}/`
  }

  async uploadImage(options: ImageUploadOptions) {
    const { userUid, buffer, filename, mimetype, maxDimension, removePrefix } = options
    this.logger.info({ userUid, filename, size: buffer.length }, 'Uploading image')
    try {
      const dims = headerDimensions(buffer)
      if (dims != null && (dims.width > MAX_IMAGE_DIMENSION || dims.height > MAX_IMAGE_DIMENSION)) {
        this.logger.warn({ userUid, ...dims }, 'Image rejected before decode: dimensions too large')
        throw oversizeImageError()
      }
      const image = await Jimp.fromBuffer(buffer)
      if (image.bitmap.width > MAX_IMAGE_DIMENSION || image.bitmap.height > MAX_IMAGE_DIMENSION) {
        this.logger.warn(
          { userUid, width: image.bitmap.width, height: image.bitmap.height },
          'Image rejected: dimensions too large'
        )
        throw oversizeImageError()
      }
      image.scaleToFit({ w: maxDimension, h: maxDimension })
      const output = await image.getBuffer(mimetype, { quality: 50 })

      const unacceptable = await isUnacceptable(this.vision, output, this.logger)
      if (unacceptable) {
        this.logger.warn('Image rejected due to unacceptable content')
        throw new ImageUploadError('Image contains unacceptable content and cannot be uploaded.', {
          image: ['Image contains unacceptable content and cannot be uploaded.']
        })
      }

      const bucket = this.storage.bucket(this.imageBucket)
      if (removePrefix != null) {
        const [files] = await bucket.getFiles({ prefix: `${userUid}/${removePrefix}` })
        await Promise.all(files.map((file) => file.delete()))
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
