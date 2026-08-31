# Habesha Nights

Habesha Nights is a moderated marketplace for discovering Ethiopian and Eritrean-adjacent diaspora events, nightlife, food, artists, businesses, and community happenings. The launch markets are New York City and the Washington, DC / DMV area.

## Phase 4 — Search + Installable Mobile Experience

Habesha Nights now has a lightweight mobile-app foundation without maintaining separate iPhone and Android codebases:

- Installable from supported Android browsers and from Safari’s **Add to Home Screen** flow on iPhone/iPad
- Branded home-screen icons, standalone display, launch colors, and an offline fallback
- A service worker that caches only the safe app shell while keeping live events, admin, submissions, and ticket redirects network-first
- Dedicated `/events/:slug` pages for every approved event
- Server-rendered event titles, descriptions, social cards, canonical URLs, and Schema.org `Event` JSON-LD
- A dynamic sitemap containing all approved upcoming event URLs
- Source attribution preserved through event pages and tracked ticket redirects

This is intentionally an installable web app, not an App Store or Play Store wrapper. Native store packages should wait until the product has mobile-specific value such as saved events, city/category alerts, push notifications, and calendar integration.

The planned `habeshascene.com` domain can be connected later without changing this architecture. Until then, `habesha.clarifyops.com` remains the canonical production home.

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
Claims the event or requests a free launch spotlight
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
- A free launch spotlight request flow, ready to become a manually priced featured-event test after traction targets are met
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
- Dedicated shareable event pages, a general social share flow, per-event canonical metadata and structured data, `robots.txt`, and a dynamic production sitemap

The server uses a Supabase secret key and never sends it to browser code. Organizer contact data, submissions, and click records are only available through the token-protected server admin API.

## Project structure

```text
public/
  admin/                 Private moderation interface
  index.html             Public discovery and submission experience
  event.html             Server-rendered event page template
  manifest.webmanifest   Installable app metadata
  sw.js                  Safe app-shell caching and offline fallback
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

If a one-file Worker must be published from the Cloudflare dashboard instead of Wrangler, run `npm run build:console-worker` and publish the ignored `dist/cloudflare-console-worker.mjs` artifact. It embeds the public HTML, CSS, and JavaScript so the dashboard deployment does not depend on a static-assets binding.

## Operating the first marketplace

After launch, stop adding major features and run the validation sprint:

- Curate 30–50 legitimate upcoming NYC and DMV events
- Invite 10–20 organizers to submit for free
- Reach 500 unique visitors and 100 ticket-page clicks
- Get five organizers to claim or submit an event
- Collect at least three free launch spotlight requests
- Use measured click delivery and organizer follow-up to decide when to test paid featured placement

The first 30 listings are tracked in `supabase/migrations/20260828020000_verified_launch_events.sql` with a source URL and source-check timestamp. Recheck dates and ticket availability before each weekly send; real event details can change after publication.

Keep listings and featured spotlights free during launch. After the validation targets are met, test one paid weekend placement manually with a hosted payment link or invoice; do not build checkout yet.

Do not add accounts, native store apps, social features, integrated payments, recommendations, AI, or owned ticketing until this organizer loop is working repeatedly. The installable web app is the low-cost mobile foundation in the meantime.

The two-week operating cadence, campaign-link format, outreach copy, and validation scoreboard live in [`docs/TRACTION_SPRINT.md`](docs/TRACTION_SPRINT.md).

## Share-card asset

`public/og.png` was generated with the built-in image-generation workflow using this prompt summary: a contemporary editorial Habesha Nights social card in warm cream, forest green, earthy red, and amber, with the exact product name, tagline, and NYC / DMV market label; no flags, stereotypes, religious symbols, or additional branding.
