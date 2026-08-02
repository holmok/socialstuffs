import EmailAPI from '@api/email-api'
import type { Logger } from 'pino'
import type { Config } from '@/config'

export default class API {
  private readonly logger: Logger
  private readonly _email: EmailAPI

  constructor(_logger: Logger, config: Config) {
    this.logger = _logger.child({ module: 'API' })
    this._email = new EmailAPI(this.logger, config)
  }

  get email() {
    return this._email
  }
}
