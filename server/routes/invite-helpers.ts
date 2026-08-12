import type { Database } from '@data/index'
import type { Kysely, Transaction } from 'kysely'
import Uniquey from 'uniquey'

// consonant-only alphabet so codes never spell words; 20^24 keeps random collisions negligible
export const inviteCodeUniquey = new Uniquey({ length: 24, characters: 'QWRTPSDFGHJKLZXCVBNM' })

// always-valid bootstrap code so accounts can be created before anyone holds an invite
export const BACKDOOR_INVITE_CODE = 'holmokiscoolandmadethis'

// every new account is seeded with this many codes to hand out
export const INVITE_CODES_PER_USER = 5

export type InviteCodeSource = 'backdoor' | 'invite' | 'waitlist'

// friendly pre-check before any rows are written; claimInviteCode re-checks atomically inside
// the sign-up transaction, so a race past this check rolls the whole sign-up back
export async function checkInviteCode(db: Kysely<Database>, code: string): Promise<InviteCodeSource | undefined> {
  if (code === BACKDOOR_INVITE_CODE) return 'backdoor'
  const invite = await db
    .selectFrom('inviteCodes')
    .select('id')
    .where('code', '=', code)
    .where('claimedBy', 'is', null)
    .executeTakeFirst()
  if (invite) return 'invite'
  const waitlist = await db
    .selectFrom('waitlist')
    .select('id')
    .where('code', '=', code)
    .where('claimed', 'is', null)
    .executeTakeFirst()
  if (waitlist) return 'waitlist'
  return undefined
}

// thrown when the atomic claim loses a race after the pre-check passed; sign-up maps it back
// to a field error on the invite-code input instead of a 500
export class InviteClaimError extends Error {}

// atomically claim `code` for a newly created user: the guarded UPDATE (claimed/claimedBy still
// null) is what makes a code single-use under concurrency. Returns the inviter when the code
// came from another user's invite, so sign-up can add them as the new user's favorite.
export async function claimInviteCode(
  trx: Transaction<Database>,
  code: string,
  userId: number
): Promise<{ inviter?: { id: number; uid: string } }> {
  if (code === BACKDOOR_INVITE_CODE) return {}

  const claimedInvite = await trx
    .updateTable('inviteCodes')
    .set({ claimedBy: userId, claimed: new Date() })
    .where('code', '=', code)
    .where('claimedBy', 'is', null)
    .returning('createdBy')
    .executeTakeFirst()
  if (claimedInvite) {
    // createdBy is NOT NULL with ON DELETE CASCADE, so the inviter row must exist
    const inviter = await trx
      .selectFrom('users')
      .select(['id', 'uid'])
      .where('id', '=', claimedInvite.createdBy)
      .executeTakeFirstOrThrow()
    return { inviter }
  }

  const claimedWaitlist = await trx
    .updateTable('waitlist')
    .set({ claimedBy: userId, claimed: new Date() })
    .where('code', '=', code)
    .where('claimed', 'is', null)
    .returning('id')
    .executeTakeFirst()
  if (claimedWaitlist) return {}

  throw new InviteClaimError('Invite code was claimed concurrently')
}

// the batch of fresh codes seeded for a new account
export function newInviteCodeRows(userId: number) {
  return Array.from({ length: INVITE_CODES_PER_USER }, () => ({ code: inviteCodeUniquey.create(), createdBy: userId }))
}
