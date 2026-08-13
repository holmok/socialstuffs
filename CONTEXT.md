# socialstuffs

An invite-only, server-rendered social app: members write posts for a chosen audience, comment on each other's posts, and curate who they see and who sees them.

## Language

### People

**User**:
A person with an account. Has exactly one status: Pending (signed up, email not yet validated), Active (validated, may sign in), Inactive (reserved for suspension — treated like Deleted at sign-in, but nothing sets it yet), or Deleted (account removed at their own request).
_Avoid_: Member, account (an "account" is what a User has, not who they are)

**Role**:
A User's permission tier: `user` (default), `admin` (moderation powers), or `owner` (the site operator; everything an admin can do plus owner-only controls).

**Favorite**:
A one-directional pick of another User — "I want to see this person." A User's favorites drive their home Feed and may be granted first access to posts. Capped at 10; not mutual, and the favorited User is not notified.
_Avoid_: Follow, friend, subscription

**Approval / Disapproval**:
A one-directional stance a User takes on another User (at most one stance per person, capped at 50 each). Approving is dual-purpose: it admits that person to your approved-only Audiences *and* adds their posts to your Feed. Disapproving says "this person never sees my non-disapproved posts" — it does not hide their content from you.
_Avoid_: Block (disapproval only hides your posts from them; it does not hide their content from you), friend, relation (the storage name — say the stance)

### Content

**Post**:
A piece of content by one User: text, optionally an image and a link. Has exactly one status: Draft (author-only, unpublished), Published (visible to its Audience), Archived (retired by the author), or Deleted. Only Published posts are ever visible to anyone but the author.

**Audience**:
The author's per-post choice of who may see a Published post: Everyone, Non-disapproved (everyone except Users the author disapproves), Approved (only Users the author approves), or Favorites (only Users the author has favorited). A post with no explicit choice is Everyone.
_Avoid_: Post target, targets (storage names), visibility

**Comment**:
A short reply attached to a Post, shown oldest-first. A Post holds at most 30 comments; at the cap the conversation is closed rather than trimmed.

**Feed**:
The signed-in home page: the newest Published posts from the viewer themself and from the Users they have favorited or approved, filtered by each post's Audience.
_Avoid_: Timeline, wall

**Discover**:
A browse page of the newest Everyone-audience posts from all Active authors, for finding people worth favoriting.
_Avoid_: Explore, trending (nothing is ranked)

### Getting in

**Invite code**:
A single-use code that admits one new sign-up. Every new account is seeded with 5 codes to hand out; when a code is claimed, the inviter automatically becomes one of the new User's favorites.

**Waitlist entry**:
An email address waiting for admission. An admin invites an entry by sending it a code (revocable until claimed); claiming that code at sign-up consumes the entry. Waitlist codes have no inviter, so they seed no favorite.

**Account validation**:
The email-confirmation step between sign-up and Active status. A Pending User cannot sign in until they follow the emailed validation link.
_Avoid_: Verification, activation (activation is the *result*; validation is the step)
