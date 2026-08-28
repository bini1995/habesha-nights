# Habesha Nights

Habesha Nights is a moderated marketplace for discovering Ethiopian and Eritrean-adjacent diaspora events, nightlife, food, artists, businesses, and community happenings. The launch markets are New York City and the Washington, DC / DMV area.

## Phase 3 — Launch and Traction

The production application no longer contains a mock event catalog. It now supports the complete early marketplace loop:

```text
Visitor arrives from Instagram, TikTok, Google, WhatsApp, an organizer, or direct
        ↓
Discovers a real approved event
        ↓
Event view + source recorded
        ↓
Tracked /go/:slug ticket redirect
        ↓
Organizer sees measurable demand
        ↓
Claims the event or requests a $39 weekend feature
```

The original moderated listing loop remains:

```text
Organizer submits event
        ↓
Pending moderation
        ↓
Admin edits, approves, or rejects
        ↓
Approved event appears publicly
```

### Included

- Supabase/Postgres tables for events, organizers, venues, businesses, cities, categories, submissions, and outbound clicks
- Event views, unique browser visitors, and source attribution for Instagram, TikTok, Google, organizers, WhatsApp, direct, and other referrals
- Manual `Claim this event` requests with admin verification
- A $39 weekend featured-event request product, intentionally without Stripe or automated checkout
- `draft`, `pending`, `approved`, and `rejected` moderation states
- Atomic approval transaction that normalizes a submission into organizer, venue, and event records
- Public event submission form with optional flyer upload to Supabase Storage
- Private `/admin/` queue for reviewing, editing, approving, and rejecting submissions
- Server-side ticket redirects with privacy-preserving hashed IP metadata, attribution, view counts, click-through rate, and source breakdowns
- Public catalog that returns approved upcoming events only
- NYC and DMV reference records, eight launch categories, and 30 source-checked upcoming launch events—but no fake events
- Row Level Security and revoked browser access on every application table
- A Cloudflare Worker production adapter that preserves the Express application’s public API, admin, upload, approval, and redirect behavior
- Cloudflare static assets, native submission rate limiting, and production observability configured in `wrangler.jsonc`

The server uses a Supabase secret key and never sends it to browser code. Organizer contact data, submissions, and click records are only available through the token-protected server admin API.

## Project structure

```text
public/
  admin/                 Private moderation interface
  index.html             Public discovery and submission experience
src/
  domain/                Submission and engagement validation
  routes/                Public and admin APIs
  services/              Supabase repository and click tracking
supabase/
  migrations/            Reproducible marketplace schema
  tests/database/        Transactional Postgres tests
worker/                   Production Sites adapter
tests/                    HTTP, validation, and service tests
```

## Local setup

Requirements: Node.js 22+, Docker, and npm.

```bash
npm install
npx supabase start
```

Copy `.env.example` to `.env`, then use the local values printed by Supabase:

```text
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=<local service role key>
ADMIN_TOKEN=<long random private value>
CLICK_HASH_SALT=<different long random value>
```

Start Habesha Nights:

```bash
npm start
```

- Public site: <http://localhost:3000>
- Admin moderation: <http://localhost:3000/admin/>
- Health: <http://localhost:3000/health>

The site starts safely without Supabase credentials, but it serves an empty real-data catalog and disables submissions/admin writes until the database is configured. It never falls back to sample events.

## Verification

```bash
npm run check
npm test
npm run test:db
docker compose config -q
```

The database test requires the local Supabase stack. It verifies all 11 tables, reference seeds, the flyer bucket, RLS foundation, and the complete pending-to-approved transaction.

## Hosted Supabase and Cloudflare launch

1. Create a Supabase project.
2. Link it using the project reference shown in the Supabase dashboard.
3. Apply the tracked migration with `npx supabase db push`.
4. Set the private runtime values with `npx wrangler secret put SUPABASE_SECRET_KEY`, `npx wrangler secret put ADMIN_TOKEN`, and `npx wrangler secret put CLICK_HASH_SALT`.
5. Confirm the non-secret Supabase URL and flyer bucket in `wrangler.jsonc`, then deploy with `npx wrangler deploy`.
6. Use a Supabase secret key when available; the legacy service-role key remains supported for older projects.
7. Keep both key types server-only and keep `.env` untracked.

The public browser does not connect directly to Supabase. This keeps moderation data and organizer contact details behind the application server and lets the database deny `anon` and `authenticated` table access.

The production deployment serves `public/` through the Cloudflare Worker in `worker/`. The local Node/Express server remains the fastest development workflow and shares the same database contract.

## Operating the first marketplace

After launch, stop adding major features and run the validation sprint:

- Curate 30–50 legitimate upcoming NYC and DMV events
- Invite 10–20 organizers to submit for free
- Reach 500 unique visitors and 100 ticket-page clicks
- Get five organizers to claim or submit an event
- Sell one $39 weekend feature manually
- Use measured click delivery to validate paid featured placement

The first 30 listings are tracked in `supabase/migrations/20260828020000_verified_launch_events.sql` with a source URL and source-check timestamp. Recheck dates and ticket availability before each weekly send; real event details can change after publication.

Do not add accounts, native apps, social features, integrated payments, recommendations, AI, or owned ticketing until this organizer loop is working repeatedly.

## Share-card asset

`public/og.png` was generated with the built-in image-generation workflow using this prompt summary: a contemporary editorial Habesha Nights social card in warm cream, forest green, earthy red, and amber, with the exact product name, tagline, and NYC / DMV market label; no flags, stereotypes, religious symbols, or additional branding.
