import { afterAll, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import LanguageAPI from '@api/language-api'
import { LanguageServiceClient } from '@google-cloud/language'
import pino from 'pino'
import LoadConfig from '@/config'

const config = LoadConfig()
const logger = pino({ level: 'silent' })

// prototype-level spy (same pattern as the ImagesAPI tests) so no Google credentials or network are ever touched
const moderateSpy = spyOn(LanguageServiceClient.prototype, 'moderateText')

type Category = { name?: string | null; confidence?: number | null }
function mockModeration(categories: Category[] | undefined) {
  moderateSpy.mockResolvedValue([{ moderationCategories: categories }] as never)
}

const api = new LanguageAPI(logger, config)

beforeEach(() => {
  moderateSpy.mockClear()
})

afterAll(() => {
  moderateSpy.mockRestore()
})

describe('getContentFlags', () => {
  test('sends the content as a PLAIN_TEXT document', async () => {
    mockModeration([])
    await api.getContentFlags('hello there')
    expect(moderateSpy).toHaveBeenCalledWith({ document: { content: 'hello there', type: 'PLAIN_TEXT' } })
  })

  test('returns an empty array when no categories come back', async () => {
    mockModeration([])
    expect(await api.getContentFlags('nice post')).toEqual([])
  })

  test('returns an empty array when moderationCategories is missing entirely', async () => {
    mockModeration(undefined)
    expect(await api.getContentFlags('nice post')).toEqual([])
  })

  test('flags a category whose confidence meets or exceeds its threshold', async () => {
    // Insult threshold is 0.6 — exactly at the threshold counts as flagged
    mockModeration([{ name: 'Insult', confidence: config.languageThresholds.Insult }])
    expect(await api.getContentFlags('you fool')).toEqual(['Insult'])
  })

  test('does not flag a category below its threshold', async () => {
    mockModeration([{ name: 'Toxic', confidence: config.languageThresholds.Toxic - 0.01 }])
    expect(await api.getContentFlags('mild venting')).toEqual([])
  })

  test('flags only the categories over threshold when several come back', async () => {
    mockModeration([
      { name: 'Derogatory', confidence: 0.9 },
      { name: 'Toxic', confidence: 0.5 },
      { name: 'Sexual', confidence: 0.95 }
    ])
    expect(await api.getContentFlags('bad post')).toEqual(['Derogatory', 'Sexual'])
  })

  test('ignores categories with no configured threshold', async () => {
    mockModeration([{ name: 'Politics', confidence: 0.99 }])
    expect(await api.getContentFlags('election talk')).toEqual([])
  })

  test('ignores categories with a null or missing confidence', async () => {
    mockModeration([{ name: 'Violent', confidence: null }, { name: 'Insult' }])
    expect(await api.getContentFlags('unknown confidence')).toEqual([])
  })

  test('a client failure surfaces as the generic moderation error', async () => {
    moderateSpy.mockRejectedValue(new Error('api down') as never)
    const err = await api.getContentFlags('anything').catch((e) => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toBe('Failed to moderate content')
  })
})
