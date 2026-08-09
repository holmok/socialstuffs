import EmailAPI from '@api/email-api'
import ImagesAPI from '@api/image-api'
import LanguageAPI from '@api/language-api'
import UserDataAPI from '@api/user-data-api'
import type data from '@data/index'
import type { Logger } from 'pino'
import type { Config } from '@/config'

export default class API {
  private readonly logger: Logger
  private readonly _email: EmailAPI
  private readonly _images: ImagesAPI
  private readonly _language: LanguageAPI
  private readonly _userData: UserDataAPI

  constructor(db: ReturnType<typeof data>, _logger: Logger, config: Config) {
    this.logger = _logger.child({ module: 'API' })
    this._email = new EmailAPI(this.logger, config)
    this._images = new ImagesAPI(this.logger, config)
    this._language = new LanguageAPI(this.logger, config)
    this._userData = new UserDataAPI(db, config, this.logger)
  }

  get email() {
    return this._email
  }
  get images() {
    return this._images
  }
  get language() {
    return this._language
  }
  get userData() {
    return this._userData
  }
}
