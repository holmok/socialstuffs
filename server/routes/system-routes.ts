import type { Hono } from 'hono'
import { sql } from 'kysely'
import type { Logger } from 'pino'
export default function SystemRoutes(app: Hono, logger: Logger) {
  logger.info('Registering public routes')

  app.get('/start-up', async (c) => {
    try {
      const { db } = c.var
      await sql`SELECT 1`.execute(db)
    } catch (err) {
      logger.error(err)
      return c.json({ error: 'Failed to start up' }, 500)
    }
    return c.json({ status: 'ready' })
  })

  app.get('/liveness', async (c) => {
    return c.json({ status: 'alive' })
  })
}
