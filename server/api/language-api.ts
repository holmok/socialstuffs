import { LanguageServiceClient } from '@google-cloud/language'
import type { Logger } from 'pino'
import type { Config } from '@/config'
import { logError } from '@/utils'

export default class LanguageAPI {
  private readonly logger: Logger
  private readonly threshold: Record<string, number>
  private readonly client: LanguageServiceClient

  constructor(_logger: Logger, config: Config) {
    this.logger = _logger.child({ module: 'LanguageAPI' })
    this.threshold = config.languageThresholds
    this.client = new LanguageServiceClient()
    this.logger.info('LanguageAPI initialized with thresholds')
  }

  async getContentFlags(content: string) {
    this.logger.info({ length: content.length }, 'Moderating content')
    const document = {
      content,
      type: 'PLAIN_TEXT' as const
    }
    try {
      const [result] = await this.client.moderateText({ document })
      const flaggedCategories: string[] = []
      for (const category of result.moderationCategories ?? []) {
        if (category.confidence != null) {
          const threshold = this.threshold[category.name as string]
          if (threshold != null && category.confidence >= threshold) {
            // log shape only, never the text itself — flagged user content must not land in logs
            this.logger.warn(
              { length: content.length, category: category.name, confidence: category.confidence },
              'Content flagged as inappropriate'
            )
            flaggedCategories.push(category.name as string)
          }
        }
      }
      return flaggedCategories
    } catch (error) {
      logError(this.logger, error, 'Error during content moderation')
      throw new Error('Failed to moderate content')
    }
  }
}
