import AdminDashboardPage, { type AdminStats } from '@pages/admin/dashboard'
import AdminWaitlistPage from '@pages/admin/waitlist'
import AdminWaitlistUnclaimedPage from '@pages/admin/waitlist-unclaimed'
import type { Context, Hono } from 'hono'
import type { Logger } from 'pino'
import * as m from '@/middleware'
import * as utils from '@/utils'
import { inviteCodeUniquey } from './invite-helpers'

const WAITLIST_PER_PAGE = 25

// the seed script (scripts/seed-fake-data.ts) fills the waitlist with @example.com addresses;
// never hand those to Postmark — rows still update normally so seeded data flows through the states
function isSeededEmail(email: string) {
  return email.toLowerCase().endsWith('@example.com')
}

// checked ids from the waitlist table form; tolerates a missing/unparseable body
async function selectedIds(c: Context): Promise<number[]> {
  try {
    const formData = await c.req.formData()
    return formData
      .getAll('ids')
      .map((value) => Number.parseInt(String(value), 10))
      .filter((id) => Number.isInteger(id))
  } catch {
    return []
  }
}

export default function AdminRoutes(app: Hono, logger: Logger) {
  logger.info('Registering admin routes')
  const admin = app.basePath('/admin')
  // authorize() checks the DB role, so a demotion locks these routes immediately (the JWT claim only drives the nav item)
  admin.use('*', m.authorize({ requireAuth: true, roles: ['admin', 'owner'] }))

  admin.get('/', async (c) => {
    const { db } = c.var
    const count = 'total' as const
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    const [
      waitlistWaiting,
      invitesOutstanding,
      waitlistJoined,
      usersTotal,
      usersActive,
      usersNewWeek,
      postsTotal,
      postsPublished,
      commentsTotal,
      userInvitesUnclaimed,
      userInvitesClaimed
    ] = await Promise.all([
      db
        .selectFrom('waitlist')
        .select((eb) => eb.fn.countAll<number>().as(count))
        .where('sent', 'is', null)
        .executeTakeFirst(),
      db
        .selectFrom('waitlist')
        .select((eb) => eb.fn.countAll<number>().as(count))
        .where('code', 'is not', null)
        .where('claimed', 'is', null)
        .executeTakeFirst(),
      db
        .selectFrom('waitlist')
        .select((eb) => eb.fn.countAll<number>().as(count))
        .where('claimed', 'is not', null)
        .executeTakeFirst(),
      db
        .selectFrom('users')
        .select((eb) => eb.fn.countAll<number>().as(count))
        .executeTakeFirst(),
      db
        .selectFrom('users')
        .select((eb) => eb.fn.countAll<number>().as(count))
        .where('status', '=', 'active')
        .executeTakeFirst(),
      db
        .selectFrom('users')
        .select((eb) => eb.fn.countAll<number>().as(count))
        .where('created', '>', sevenDaysAgo)
        .executeTakeFirst(),
      db
        .selectFrom('posts')
        .select((eb) => eb.fn.countAll<number>().as(count))
        .where('status', '!=', 'deleted')
        .executeTakeFirst(),
      db
        .selectFrom('posts')
        .select((eb) => eb.fn.countAll<number>().as(count))
        .where('status', '=', 'published')
        .executeTakeFirst(),
      db
        .selectFrom('comments')
        .select((eb) => eb.fn.countAll<number>().as(count))
        .executeTakeFirst(),
      db
        .selectFrom('inviteCodes')
        .select((eb) => eb.fn.countAll<number>().as(count))
        .where('claimedBy', 'is', null)
        .executeTakeFirst(),
      db
        .selectFrom('inviteCodes')
        .select((eb) => eb.fn.countAll<number>().as(count))
        .where('claimedBy', 'is not', null)
        .executeTakeFirst()
    ])

    const stats: AdminStats = {
      waitlistWaiting: Number(waitlistWaiting?.total ?? 0),
      invitesOutstanding: Number(invitesOutstanding?.total ?? 0),
      waitlistJoined: Number(waitlistJoined?.total ?? 0),
      usersTotal: Number(usersTotal?.total ?? 0),
      usersActive: Number(usersActive?.total ?? 0),
      usersNewWeek: Number(usersNewWeek?.total ?? 0),
      postsTotal: Number(postsTotal?.total ?? 0),
      postsPublished: Number(postsPublished?.total ?? 0),
      commentsTotal: Number(commentsTotal?.total ?? 0),
      userInvitesUnclaimed: Number(userInvitesUnclaimed?.total ?? 0),
      userInvitesClaimed: Number(userInvitesClaimed?.total ?? 0)
    }

    return c.render(AdminDashboardPage({ stats }), {
      title: 'Admin',
      description: 'Site administration dashboard.',
      styles: ['user', 'admin']
    })
  })

  admin.get('/waitlist', async (c) => {
    const { db } = c.var
    // ?p=<page> drives the offset; anything unparseable or below 1 lands on page 1
    const page = Math.max(1, Number.parseInt(c.req.query('p') ?? '', 10) || 1)

    // one extra row decides hasOlder — same pattern as the feed pages
    const rows = await db
      .selectFrom('waitlist')
      .select(['id', 'email', 'created', 'sent'])
      .where('sent', 'is', null)
      .orderBy('created', 'asc')
      .orderBy('id', 'asc')
      .limit(WAITLIST_PER_PAGE + 1)
      .offset((page - 1) * WAITLIST_PER_PAGE)
      .execute()

    return c.render(
      AdminWaitlistPage({
        rows: rows.slice(0, WAITLIST_PER_PAGE),
        page,
        hasNewer: page > 1,
        hasOlder: rows.length > WAITLIST_PER_PAGE
      }),
      { title: 'Admin: Waitlist', description: 'People waiting for an invite.', styles: ['user', 'admin'] }
    )
  })

  admin.post('/waitlist/send', async (c) => {
    const { db, api, config, flash, logger } = c.var
    const ids = await selectedIds(c)
    if (ids.length === 0) {
      await flash.addFlash('info', 'Select at least one person to invite.')
      return utils.redirect(c, '/admin/waitlist')
    }

    let sent = 0
    let failedEmails = 0
    for (const id of ids) {
      const code = inviteCodeUniquey.create()
      // guarded update: only rows still waiting get a code, so a double-submit can't overwrite
      // an already-sent invite
      const row = await db
        .updateTable('waitlist')
        .set({ code, sent: new Date() })
        .where('id', '=', id)
        .where('sent', 'is', null)
        .returning('email')
        .executeTakeFirst()
      if (row == null) continue

      if (isSeededEmail(row.email)) {
        logger.info('Skipping invite email for seeded @example.com address')
        sent += 1
        continue
      }

      // deliberate catch: the invite row is already updated, so a failed send is non-fatal — the
      // invite shows up under Unclaimed Invites where it can be revoked (returning them to the list)
      try {
        await api.email.sendEmail({
          to: row.email,
          subject: "It's your turn — come join Social Stuffs!",
          template: 'waitlist-invite-email',
          data: { code, url: new URL(`/sign-up?code=${code}`, config.baseLinkUrl).href }
        })
        sent += 1
      } catch (error) {
        utils.logError(logger, error, 'Error sending waitlist invite email')
        failedEmails += 1
      }
    }

    logger.info({ requested: ids.length, sent, failedEmails }, 'Waitlist invites sent')
    if (sent > 0) await flash.addFlash('success', `Sent ${sent} invite${sent === 1 ? '' : 's'}.`)
    if (failedEmails > 0) {
      await flash.addFlash(
        'error',
        `${failedEmails} invite email${failedEmails === 1 ? '' : 's'} failed to send — those invites are under Unclaimed Invites and can be revoked.`
      )
    }
    return utils.redirect(c, '/admin/waitlist')
  })

  admin.get('/waitlist-unclaimed', async (c) => {
    const { db } = c.var
    // ?p=<page> drives the offset; anything unparseable or below 1 lands on page 1
    const page = Math.max(1, Number.parseInt(c.req.query('p') ?? '', 10) || 1)

    // one extra row decides hasOlder — same pattern as the feed pages
    const rows = await db
      .selectFrom('waitlist')
      .select(['id', 'email', 'created', 'sent'])
      .where('code', 'is not', null)
      .where('claimed', 'is', null)
      .orderBy('created', 'asc')
      .orderBy('id', 'asc')
      .limit(WAITLIST_PER_PAGE + 1)
      .offset((page - 1) * WAITLIST_PER_PAGE)
      .execute()

    return c.render(
      AdminWaitlistUnclaimedPage({
        rows: rows.slice(0, WAITLIST_PER_PAGE),
        page,
        hasNewer: page > 1,
        hasOlder: rows.length > WAITLIST_PER_PAGE
      }),
      { title: 'Admin: Unclaimed Invites', description: 'Waitlist invites not yet claimed.', styles: ['user', 'admin'] }
    )
  })

  admin.post('/waitlist-unclaimed/revoke', async (c) => {
    const { db, api, flash, logger } = c.var
    const ids = await selectedIds(c)
    if (ids.length === 0) {
      await flash.addFlash('info', 'Select at least one invite to revoke.')
      return utils.redirect(c, '/admin/waitlist-unclaimed')
    }

    let revoked = 0
    for (const id of ids) {
      // guarded update: a claimed invite can't be revoked (the account already exists), and
      // clearing code+sent returns the person to the waiting pool
      const row = await db
        .updateTable('waitlist')
        .set({ code: null, sent: null })
        .where('id', '=', id)
        .where('code', 'is not', null)
        .where('claimed', 'is', null)
        .returning('email')
        .executeTakeFirst()
      if (row == null) continue
      revoked += 1

      if (isSeededEmail(row.email)) {
        logger.info('Skipping revoke email for seeded @example.com address')
        continue
      }

      // deliberate catch: the code is already disabled; the courtesy email failing is log-only
      try {
        await api.email.sendEmail({
          to: row.email,
          subject: 'Your Social Stuffs invite code was revoked.',
          template: 'waitlist-revoke-email',
          data: {}
        })
      } catch (error) {
        utils.logError(logger, error, 'Error sending waitlist revoke email')
      }
    }

    logger.info({ requested: ids.length, revoked }, 'Waitlist invites revoked')
    await flash.addFlash(
      revoked > 0 ? 'success' : 'info',
      revoked > 0 ? `Revoked ${revoked} invite${revoked === 1 ? '' : 's'}.` : 'No invites were revoked.'
    )
    return utils.redirect(c, '/admin/waitlist-unclaimed')
  })
}
