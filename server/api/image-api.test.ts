import { afterAll, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import ImagesAPI, { ImageUploadError, type ImageUploadOptions } from '@api/image-api'
import { Storage } from '@google-cloud/storage'
import Vision from '@google-cloud/vision'
import { Jimp } from 'jimp'
import pino from 'pino'
import LoadConfig from '@/config'

const config = LoadConfig()
const logger = pino({ level: 'silent' })

// a real 100x60 JPEG so the resize path exercises actual decoding
const srcBuffer = await new Jimp({ width: 100, height: 60, color: 0x336699ff }).getBuffer('image/jpeg')

// fake GCS bucket: records saves/deletes instead of talking to Google
type SavedFile = { path: string; data: Buffer; options: { metadata?: { contentType?: string } } }
let saved: SavedFile[] = []
let deleted: string[] = []
let existingFiles: string[] = []
let getFilesArgs: { prefix: string }[] = []
let saveError: Error | undefined

const fakeBucket = {
  getFiles: async (opts: { prefix: string }) => {
    getFilesArgs.push(opts)
    return [
      existingFiles.map((name) => ({
        name,
        delete: async () => {
          deleted.push(name)
        }
      }))
    ]
  },
  file: (path: string) => ({
    save: async (data: Buffer, options: SavedFile['options']) => {
      if (saveError) throw saveError
      saved.push({ path, data, options })
    }
  })
}

// prototype-level spies (same pattern as the EmailAPI stub in the flow tests) so no
// Google credentials or network are ever touched
const bucketSpy = spyOn(Storage.prototype, 'bucket').mockReturnValue(fakeBucket as never)
const visionSpy = spyOn(Vision.ImageAnnotatorClient.prototype, 'safeSearchDetection')

type Likelihoods = { adult?: string; violence?: string; racy?: string }
function mockVision(annotation: Likelihoods | null) {
  visionSpy.mockResolvedValue([{ safeSearchAnnotation: annotation }] as never)
}
const SAFE: Likelihoods = { adult: 'VERY_UNLIKELY', violence: 'UNLIKELY', racy: 'POSSIBLE' }

const api = new ImagesAPI(logger, config)

function options(overrides: Partial<ImageUploadOptions> = {}): ImageUploadOptions {
  return {
    userUid: 'test-user-uid',
    buffer: srcBuffer,
    filename: 'avatar',
    mimetype: 'image/jpeg',
    maxDimension: 32,
    ...overrides
  }
}

beforeEach(() => {
  saved = []
  deleted = []
  existingFiles = []
  getFilesArgs = []
  saveError = undefined
  mockVision(SAFE)
})

afterAll(() => {
  bucketSpy.mockRestore()
  visionSpy.mockRestore()
})

describe('uploadImage', () => {
  test('resizes to fit maxDimension, saves as <uid>/<filename>.jpg with a jpeg content type, and returns the public URL', async () => {
    const url = await api.uploadImage(options())

    expect(saved.length).toBe(1)
    expect(saved[0].path).toBe('test-user-uid/avatar.jpg')
    expect(saved[0].options.metadata?.contentType).toBe('image/jpeg')

    // 100x60 scaled to fit 32x32 → width pinned at 32, height shrinks proportionally
    const resized = await Jimp.fromBuffer(saved[0].data)
    expect(resized.width).toBe(32)
    expect(resized.height).toBeLessThanOrEqual(32)

    // the full base (including any bucket path segment) is preserved even without a trailing slash
    expect(url).toBe(`${config.baseImageUrl.replace(/\/$/, '')}/test-user-uid/avatar.jpg`)
    // no delete pass when removePrefix is not set
    expect(getFilesArgs.length).toBe(0)
  })

  test('a PNG whose header declares oversized dimensions is rejected before decoding', async () => {
    // PNG signature + IHDR declaring 20000×20000 — intentionally not a decodable file, because
    // the rejection must come from the header probe alone, before Jimp allocates the bitmap
    const bomb = Buffer.alloc(32)
    bomb.writeUInt32BE(0x89504e47, 0)
    bomb.writeUInt32BE(20000, 16)
    bomb.writeUInt32BE(20000, 20)

    const err = await api.uploadImage(options({ buffer: bomb })).catch((e) => e)
    expect(err).toBeInstanceOf(ImageUploadError)
    expect((err as ImageUploadError).errors.image?.[0]).toContain('dimensions are too large')
    expect(saved.length).toBe(0)
  })

  test('a JPEG whose start-of-frame declares oversized dimensions is rejected before decoding', async () => {
    // SOI + SOF0 segment declaring 100×9000
    const bomb = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x64, 0x23, 0x28, 0x00, 0x00, 0x00])
    const err = await api.uploadImage(options({ buffer: bomb })).catch((e) => e)
    expect(err).toBeInstanceOf(ImageUploadError)
    expect((err as ImageUploadError).errors.image?.[0]).toContain('dimensions are too large')
    expect(saved.length).toBe(0)
  })

  test('POSSIBLE likelihoods are acceptable and do not block the upload', async () => {
    mockVision({ adult: 'POSSIBLE', violence: 'POSSIBLE', racy: 'POSSIBLE' })
    await api.uploadImage(options())
    expect(saved.length).toBe(1)
  })

  for (const category of ['adult', 'violence', 'racy'] as const) {
    test(`${category}=VERY_LIKELY is rejected with an ImageUploadError and nothing is saved`, async () => {
      mockVision({ adult: 'VERY_UNLIKELY', violence: 'VERY_UNLIKELY', racy: 'VERY_UNLIKELY', [category]: 'VERY_LIKELY' })
      const err = await api.uploadImage(options()).catch((e) => e)
      expect(err).toBeInstanceOf(ImageUploadError)
      expect((err as ImageUploadError).errors.image).toEqual(['Image contains unacceptable content and cannot be uploaded.'])
      expect(saved.length).toBe(0)
    })
  }

  test('LIKELY is also rejected', async () => {
    mockVision({ adult: 'LIKELY', violence: 'VERY_UNLIKELY', racy: 'VERY_UNLIKELY' })
    const err = await api.uploadImage(options()).catch((e) => e)
    expect(err).toBeInstanceOf(ImageUploadError)
    expect(saved.length).toBe(0)
  })

  test('a missing safeSearchAnnotation allows the upload rather than blocking it', async () => {
    mockVision(null)
    await api.uploadImage(options())
    expect(saved.length).toBe(1)
  })

  test('removePrefix deletes existing files under <uid>/<prefix> before saving the new one', async () => {
    existingFiles = ['test-user-uid/avatar-old-1.jpg', 'test-user-uid/avatar-old-2.jpg']
    await api.uploadImage(options({ removePrefix: 'avatar' }))

    expect(getFilesArgs).toEqual([{ prefix: 'test-user-uid/avatar' }])
    expect(deleted).toEqual(existingFiles)
    expect(saved.length).toBe(1)
    expect(saved[0].path).toBe('test-user-uid/avatar.jpg')
  })

  test('a rejected image with removePrefix set does not delete the existing files', async () => {
    mockVision({ adult: 'VERY_LIKELY' })
    existingFiles = ['test-user-uid/avatar-old-1.jpg']
    const err = await api.uploadImage(options({ removePrefix: 'avatar' })).catch((e) => e)
    expect(err).toBeInstanceOf(ImageUploadError)
    expect(deleted).toEqual([])
    expect(saved.length).toBe(0)
  })

  test('a non-image buffer surfaces the generic error, not an ImageUploadError', async () => {
    const err = await api.uploadImage(options({ buffer: Buffer.from('not an image') })).catch((e) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(ImageUploadError)
    expect((err as Error).message).toBe('An unexpected error occurred while uploading image.')
    expect(saved.length).toBe(0)
  })

  test('a storage save failure surfaces the generic error', async () => {
    saveError = new Error('gcs down')
    const err = await api.uploadImage(options()).catch((e) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(ImageUploadError)
    expect((err as Error).message).toBe('An unexpected error occurred while uploading image.')
  })
})
