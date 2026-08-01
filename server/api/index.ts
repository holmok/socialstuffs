import type { Logger } from 'pino'
import type { Config } from '@/config'
import NoopAPI from './noop-api'

export default class API {
  private readonly _noop: NoopAPI
  private readonly logger: Logger
  private _closing: boolean = false
  private _closed: boolean = false
  constructor(
    private readonly config: Config,
    _logger: Logger
  ) {
    this._noop = new NoopAPI()
    this.logger = _logger.child({ component: 'API' })
    this.logger.info('API initialized')
  }

  get noop() {
    if (this._closing || this._closed) throw new Error('API is closing or closed')
    return this._noop
  }

  async shutdown() {
    if (this._closing || this._closed) return
    this._closing = true
    return new Promise<void>((resolve) => {
      this._closed = true
      resolve()
    })
  }
}
