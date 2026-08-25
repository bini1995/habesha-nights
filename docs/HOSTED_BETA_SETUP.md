# Hosted Leagues Beta Setup

Phase 3J keeps local leagues honest with separate commissioner and member
access, score proposals, explicit approval, key rotation, audit receipts, and a
secret-free migration download. It still does not claim to provide user
accounts or hosted multi-device persistence.

Phase 3K adds the account-ready foundation: a phone-first email login page at
`/sports-hub/account/`, a safe public configuration endpoint, server-side token
verification, a versioned Supabase migration, Row Level Security policies, and
database policy tests. Hosted league syncing is still disabled until the
staging project is configured and the migration is applied.

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
3. Leave `SUPABASE_SECRET_KEY` blank. Phase 3K login and user-scoped Row Level
   Security do not need a key that bypasses those policies.
4. In Supabase Auth URL settings, add
   `http://localhost:3000/sports-hub/account/` as a local redirect URL.
5. Choose where the Node/Docker app will be hosted and, when ready, provide the
   staging URL or domain for authentication redirects.
6. Keep the first login email-only. Google can be added after the staging URL
   is stable.

Never paste the secret key into chat, browser JavaScript, source files, GitHub,
screenshots, or a public deployment setting. Add it only through the host's
encrypted environment-variable interface or the local ignored `.env` file.
The publishable key may be used by a browser, but it does not replace Row Level
Security or a signed-in user session. The account API returns the publishable
key only; it never reads or returns the secret value.

## Apply the staging database

The tracked migration is
`supabase/migrations/20260825000000_sports_hub_accounts.sql`. It creates
profiles, leagues, memberships, owner-only invite digests, matchups, score
proposals, and append-only events. All seven tables have Row Level Security.

After creating the staging project:

1. Sign in with the Supabase CLI and link only the staging project.
2. Preview the migration with `supabase db push --dry-run`.
3. Apply it with `supabase db push`.
4. Run `supabase test db` against a local Supabase stack before inviting beta
   users.
5. Add the eventual HTTPS account callback URL to Auth URL settings before a
   public deployment.

Do not run `db reset --linked`; it deletes the linked database. The project
does not need that destructive command for this setup.

## Integration acceptance gates

- Every league table has Row Level Security enabled, anonymous grants removed,
  and explicit least-privilege grants and policies for allowed operations.
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
