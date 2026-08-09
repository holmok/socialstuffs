import EmailAPI from '@api/email-api'
import ImagesAPI from '@api/image-api'
import type { Logger } from 'pino'
import type { Config } from '@/config'

export default class API {
  private readonly logger: Logger
  private readonly _email: EmailAPI
  private readonly _images: ImagesAPI

  constructor(_logger: Logger, config: Config) {
    this.logger = _logger.child({ module: 'API' })
    this._email = new EmailAPI(this.logger, config)
    this._images = new ImagesAPI(this.logger, config)
  }

  get email() {
    return this._email
  }
  get images() {
    return this._images
  }
}
