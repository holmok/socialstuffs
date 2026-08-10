import type { Database } from '@data/index'
import type { Kysely } from 'kysely'

// shared check/claim logic for the two structurally-identical single-use token tables
// (account validation and password recovery). These helpers stay at the route layer on
// purpose: routes keep their own user-facing responses and log wording — checkToken only
// reports a typed failure reason, and claimToken only performs the atomic claim.

export type TokenTable = 'accountValidationTokens' | 'passwordRecoveryTokens'

export type TokenCheckFailure = 'missing' | 'uidMismatch' | 'claimed' | 'expired'

export type TokenCheckResult = { ok: true; userId: number } | { ok: false; reason: TokenCheckFailure }

// validates a token link BEFORE claiming: reject missing / uid-mismatch / already-claimed /
// expired. uid and created are immutable so pre-checking them is TOCTOU-free; only `claimed`
// races, and the atomic claimToken below (with a freshness predicate) handles that.
// (Two indexed lookups instead of a join: Kysely's join overloads don't resolve over a
// union table name, and the token's userId is FK-guaranteed to have a users row)
export async function checkToken(
  db: Kysely<Database>,
  table: TokenTable,
  token: string,
  uid: string,
  ttlMs: number
): Promise<TokenCheckResult> {
  const tokenRow = await db
    .selectFrom(table)
    .where('token', '=', token)
    .select(['userId', 'claimed', 'created'])
    .executeTakeFirst()

  if (!tokenRow) return { ok: false, reason: 'missing' }

  const user = await db.selectFrom('users').where('id', '=', tokenRow.userId).select(['uid']).executeTakeFirst()

  if (user?.uid !== uid) return { ok: false, reason: 'uidMismatch' }
  if (tokenRow.claimed) return { ok: false, reason: 'claimed' }
  if (Date.now() - tokenRow.created.getTime() > ttlMs) return { ok: false, reason: 'expired' }

  return { ok: true, userId: tokenRow.userId }
}

// atomically claims the single-use token: the `claimed is null` guard makes it single-use and
// the freshness predicate keeps expiry race-safe (an expired-but-unclaimed token can't be
// claimed in the window between checkToken and the claim). Returns the claimed row's userId,
// or undefined when nothing was claimed. Run inside the route's transaction alongside the
// user update it authorizes
export async function claimToken(
  db: Kysely<Database>,
  table: TokenTable,
  token: string,
  ttlMs: number
): Promise<{ userId: number } | undefined> {
  return await db
    .updateTable(table)
    .set({ claimed: new Date() })
    .where('token', '=', token)
    .where('claimed', 'is', null)
    .where('created', '>', new Date(Date.now() - ttlMs))
    .returning('userId')
    .executeTakeFirst()
}
