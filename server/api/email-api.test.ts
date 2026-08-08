import { describe, expect, spyOn, test } from 'bun:test'
import EmailAPI from '@api/email-api'
import pino from 'pino'
import Postmark from 'postmark'
import LoadConfig from '@/config'

const config = LoadConfig()
const logger = pino({ level: 'silent' })

describe('EmailAPI reuse', () => {
  test('reuses one Postmark client and reads each template file at most once', async () => {
    // Capture `this` on each send so we can prove the same client instance is reused.
    const clients: unknown[] = []
    const sendSpy = spyOn(Postmark.ServerClient.prototype, 'sendEmail').mockImplementation(async function (this: unknown) {
      clients.push(this)
      return {} as never
    })
    const fileSpy = spyOn(Bun, 'file')

    const api = new EmailAPI(logger, config)

    await api.sendEmail({ to: 'a@example.com', subject: 's', template: 'account-validation-email', data: { link: 'x' } })
    await api.sendEmail({ to: 'b@example.com', subject: 's', template: 'account-validation-email', data: { link: 'y' } })

    // The stubbed network send ran for each call (no real email sent).
    expect(sendSpy).toHaveBeenCalledTimes(2)
    // Both sends went through the same client instance — it is constructed once and reused.
    expect(clients).toHaveLength(2)
    expect(clients[0]).toBe(clients[1])
    // Template file is read only once across two sends for the same template.
    const reads = fileSpy.mock.calls.filter(([path]) => String(path).includes('account-validation-email')).length
    expect(reads).toBe(1)

    fileSpy.mockRestore()
    sendSpy.mockRestore()
  })
})
