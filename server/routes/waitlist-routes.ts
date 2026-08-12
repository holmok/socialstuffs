import WaitlistPage from '@pages/waitlist'
import WaitlistForm, { type WaitlistFormProps, WaitlistThanks } from '@templates/components/waitlist-form'
import type { Context, Hono } from 'hono'
import type { Logger } from 'pino'
import { z } from 'zod'
import * as m from '@/middleware'
import * as utils from '@/utils'

const waitlistSchema = z.object({
  email: utils.emailSchema
})

type WaitlistData = z.infer<typeof waitlistSchema>

const pageMeta = {
  title: 'Join the Waitlist',
  description: 'Get in line for a socialstuffs invite.',
  styles: ['auth'] as ['auth']
}

// HTMX failures re-render the form fragment; no-JS failures re-render the full page (mirrors GET /waitlist)
function waitlistError(c: Context, values: WaitlistFormProps, errors: Record<string, string[]>) {
  return utils.formErrorResponse(c, WaitlistForm({ ...values, errors }), WaitlistPage({ ...values, errors }), pageMeta)
}

export default function WaitlistRoutes(app: Hono, logger: Logger) {
  logger.info('Registering waitlist routes')

  app.get('/waitlist', (c) => {
    // ?joined=1 is the no-JS landing after a successful join: thank-you in place of the form
    return c.render(WaitlistPage({ joined: c.req.query('joined') != null }), pageMeta)
  })

  const joinLimit = m.rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    keyPrefix: 'waitlist',
    // echo the typed email back so a 429 doesn't wipe the form (the limiter already set the 429 status)
    onLimit: async (c) => {
      const form = await utils.formStrings(c)
      return waitlistError(c, form, { form: ['Too many attempts. Please try again later.'] })
    }
  })

  app.post('/waitlist', joinLimit, async (c) => {
    const { db, logger } = c.var
    const form = await utils.formStrings(c)
    const result = utils.validateFormData<WaitlistData>(form, waitlistSchema)

    if (!result.success) {
      logger.warn({ errors: result.errors }, 'Validation errors on waitlist form')
      return waitlistError(c, form, result.errors)
    }

    // lowercased so casing variants collapse onto the unique email index; a duplicate signup is a
    // silent no-op and gets the same success message, so the form never reveals who is on the list
    const email = result.data.email.trim().toLowerCase()
    await db
      .insertInto('waitlist')
      .values({ email })
      .onConflict((oc) => oc.column('email').doNothing())
      .execute()

    logger.info('Waitlist signup recorded')
    // the thank-you replaces the form: HTMX swaps it in place (the form targets itself with
    // outerHTML), no-JS gets the PRG redirect to the joined variant of the page
    if (c.req.header('HX-Request') === 'true') return c.html(WaitlistThanks())
    return utils.redirect(c, '/waitlist?joined=1')
  })
}
