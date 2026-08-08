import Path from 'node:path'
import type { Logger } from 'pino'
import Postmark, { type Message } from 'postmark'
import type { Config } from '@/config'
import { logError } from '@/utils'

type EmailTemplate = 'account-validation-email' | 'password-recovery-email'

export type SendEmailOptions = {
  to: string
  from?: string
  subject: string
  template: EmailTemplate
  data?: Record<string, unknown>
}

export default class EmailAPI {
  private readonly logger: Logger
  private readonly fromEmail: string
  private readonly client: Postmark.ServerClient
  private readonly templatePaths: Partial<Record<EmailTemplate, string>> = {}
  private readonly templateContents: Partial<Record<EmailTemplate, string>> = {}

  constructor(_logger: Logger, config: Config) {
    this.logger = _logger.child({ module: 'EmailAPI' })
    this.fromEmail = config.email.fromEmail
    this.client = new Postmark.ServerClient(config.email.postmarkToken)
    this.templatePaths['account-validation-email'] = Path.join(process.cwd(), 'templates/email/account-validation-email.html')
    this.templatePaths['password-recovery-email'] = Path.join(process.cwd(), 'templates/email/password-recovery-email.html')
  }

  private async loadTemplate(template: EmailTemplate): Promise<string> {
    const cached = this.templateContents[template]
    if (cached !== undefined) return cached
    const content = await Bun.file(this.templatePaths[template] as string).text()
    this.templateContents[template] = content
    return content
  }

  async sendEmail(options: SendEmailOptions) {
    this.logger.info({ template: options.template }, 'Sending email')
    const { to, from = this.fromEmail as string, subject, template, data = {} } = options

    const templatePath = this.templatePaths[options.template]
    if (!templatePath) {
      this.logger.error({ template: options.template }, 'EmailService.sendEmail() email template not found')
      throw new Error('Email template not found')
    }
    this.logger.debug({ to, from, subject, template }, 'Email options')
    try {
      const html = Object.entries(data).reduce(
        (content, [key, value]) => {
          return content.replace(new RegExp(`{{${key}}}`, 'g'), String(value))
        },
        await this.loadTemplate(template)
      )

      const msg: Message = {
        To: to,
        From: from,
        Subject: subject,
        HtmlBody: html
      }

      await this.client.sendEmail(msg)
    } catch (error) {
      logError(this.logger, error, 'Error sending email')
      throw new Error('An unexpected error occurred while sending email.')
    }
  }
}
