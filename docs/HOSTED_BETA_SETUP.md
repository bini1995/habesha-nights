# Hosted Leagues Beta Setup

Phase 3J keeps local leagues honest with separate commissioner and member
access, score proposals, explicit approval, key rotation, audit receipts, and a
secret-free migration download. It still does not claim to provide user
accounts or hosted multi-device persistence.

## Recommended beta foundation

Use one Supabase project for authentication and Postgres storage. This keeps
user identity, league data, and database-enforced Row Level Security in one
system while the existing Sports Hub services remain the business-logic layer.
The integration must remain disabled until all required values are configured.

The first hosted login should use email magic links or one-time codes. Google
login can follow after a public deployment URL exists because it requires OAuth
origin and callback configuration. Apple login can wait until the initial web
beta is stable.

## What the project owner needs to provide

1. Create a Supabase account and a new project for the Sports Hub staging beta.
2. Copy the project URL and a new `sb_publishable_...` key into the local `.env`.
3. Create a server-only `sb_secret_...` key and place it in the local `.env`.
4. Choose where the Node/Docker app will be hosted and, when ready, provide the
   staging URL or domain for authentication redirects.
5. Confirm whether the first login should be email-only or email plus Google.

Never paste the secret key into chat, browser JavaScript, source files, GitHub,
screenshots, or a public deployment setting. Add it only through the host's
encrypted environment-variable interface or the local ignored `.env` file.
The publishable key may be used by a browser, but it does not replace Row Level
Security or a signed-in user session.

## Integration acceptance gates

- Every league table has Row Level Security enabled and explicit policies for
  read, insert, update, and delete operations.
- An unauthenticated request cannot list, join, export, or alter a private
  league.
- A member can read only leagues they joined and propose only their own matchup
  results.
- Only the owner can approve scores, rotate access, lock periods, or export.
- A revoked user or session loses access immediately.
- Local exports import without access hashes and issue fresh hosted roles.
- Two-device tests cover owner, member, stranger, expired session, and recovery
  behavior before the staging beta is shared publicly.
- Payments remain disabled until authentication, recovery, privacy, rate limits,
  and entitlement enforcement pass in staging.

Official references:

- <https://supabase.com/docs/guides/auth>
- <https://supabase.com/docs/guides/database/postgres/row-level-security>
- <https://supabase.com/docs/guides/getting-started/api-keys>
- <https://supabase.com/docs/guides/auth/social-login/auth-google>
