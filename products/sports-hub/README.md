# AI Sports & Fantasy Hub

This product provides a local-first Team Analyzer and private mini-leagues for
fantasy football, basketball, and soccer, with optional future AI assistance.

Sports data adapters, fantasy advice, league rules, and scoring will remain
separate modules. Official league outcomes must be deterministic; AI output
will provide recommendations, explanations, and optional experimental
rankings.

See `docs/ROADMAP.md` for the MVP sequence.

## Phase 3A Team Analyzer

The default local profile can create and persist manually entered or JSON
submitted teams in `logs/sports-hub/teams.json`. The file uses atomic writes
and persists through the existing Docker logs volume. No authentication or API
credential is required. Clearly labeled football and basketball fixtures live
under `fixtures/` for offline testing.

New APIs under `/api/sports-hub`:

- `GET /samples/:sport` returns an offline football or basketball sample.
- `POST /teams` validates and persists a team.
- `GET /teams` lists teams for the default local profile.
- `GET /teams/:teamId` retrieves one team.
- `POST /teams/:teamId/analyze` returns a versioned Team Score and entitled
  improvement recommendations. Supply replacement options as
  `{ "availablePlayers": [...] }`.

The import boundary defines a provider-neutral adapter contract. Phase 3A
implements JSON passthrough only; ESPN, Yahoo, Sleeper, CSV, and other live
connections remain intentionally disconnected.

## Score boundaries

- **Official fantasy points** apply a league's scoring rules to player stats.
  They are league results or projections, not a roster-quality grade.
- **Team Score** is a deterministic, versioned 0–100 roster-quality measure.
  Version 1.0.0 combines starter strength, bench depth, positional balance,
  projected production, and supplied availability/risk data.
- **Manager Score** is reserved for a future assessment of manager decisions.
  It is not calculated in Phase 3A.
- **AI ranking** is reserved for optional future model output and is never used
  in Team Score or official scoring.

Every analysis includes completeness/confidence information and readable
reasons. Recommendations are deterministic comparisons against supplied bench
or available-player projections. The server returns at most two complete
recommendations for `FREE`; `PREMIUM` can return all. Free responses expose
only the count of additional locked recommendations, never their details.

## Phase 3B imports and provenance

Sports Hub accepts user-provided CSV, JSON, and bundled offline samples using
the versioned `sports-hub-import/1.0` schema. It does not scrape or connect to
ESPN, Yahoo, Sleeper, or another platform. The provider adapter boundary is
reserved for a future integration with confirmed commercial-use permission.

The schema covers sport, season, scoring period, projection date, team,
manager, league settings, scoring rules, roster slots, player projections,
waiver options, and optional availability status. Downloadable CSV and JSON
examples are available from the Team Analyzer.

Import endpoints under `/api/sports-hub`:

- `POST /imports/preview` validates `{ sourceType, sport, content, filename? }`
  without persistence. Preview IDs expire after 30 minutes.
- `POST /imports/confirm` requires `{ previewId, operation }`, where operation
  is explicitly `CREATE` or `UPDATE`.
- `GET /imports` lists metadata without embedded snapshots.
- `GET /imports/:importId` returns metadata and the normalized snapshot.
- `POST /teams/:teamId/reanalyze` reproduces analysis from `{ importId }`.
- `GET /import/templates/csv` and `/json` download example files.

Confirmed teams remain in `logs/sports-hub/teams.json`. Import metadata and
normalized snapshots are separately stored in `imports.json`; immutable
analysis inputs are stored in `analyses.json` with 500-record retention. These
ignored files persist through the Docker logs volume. Raw uploads and pasted
content are never retained. Only a SHA-256 checksum, normalized data, counts,
warnings, optional filename, and freshness metadata are stored.

Every imported analysis includes source, projection date, scoring period,
analysis version, import version, content and snapshot checksums,
completeness/confidence, and a warning when projections are over seven days
old. The FREE/PREMIUM response boundary remains unchanged.

## Phase 3E roster screenshots

Every football, basketball, and soccer builder offers an optional roster
screenshot path when `OPENAI_API_KEY` is configured. The browser accepts PNG,
JPEG, and WebP files up to 6 MB and shows a local preview plus a required
disclosure before sending the image to the OpenAI Responses API. The default
model is configurable through `OPENAI_VISION_MODEL`.

The vision service uses image input, strict structured output, `store: false`,
file-signature validation, a request timeout, and a small per-IP rate limit.
It extracts only text visibly present in the image and leaves unclear
positions, lineup roles, and projections unresolved. Raw images and raw model
responses are not persisted.

The extracted roster is a preview, never a saved team. Users must review and
correct every player card before the existing team-validation and analysis
flow can persist anything. Missing projections remain missing and lower Team
Score completeness.

Endpoints under `/api/sports-hub`:

- `GET /roster-images/status` reports whether scanning is configured plus
  supported image types and the upload limit.
- `POST /roster-images/parse` requires `{ consent: true, sport,
  imageDataUrl }` and returns a versioned extraction preview.

## Phase 3F player identity foundation

Screenshot names now pass through deterministic player identity resolution
before the review step. The matcher handles accents, punctuation, common name
suffixes, aliases, close spellings, duplicate names, sport, and position. It
returns one of `MATCHED`, `AMBIGUOUS`, or `UNMATCHED`; fuzzy matches are never
accepted automatically.

Ambiguous players receive a phone-friendly “Which player is this?” control.
The user may choose a candidate or keep the typed name. Editing a linked name
or position removes its identity provenance. A reviewed team may persist the
canonical player ID, provider ID, provider player ID, match method, match time,
and source update time.

The default provider is a fictional offline sample with only the
`PLAYER_DIRECTORY` capability. `PROJECTIONS`, `INJURIES`, and `SCHEDULES` are
explicit unimplemented capabilities until a licensed provider is selected.

Identity endpoints under `/api/sports-hub`:

- `GET /player-identities/status` reports the active directory, capability
  list, freshness, and whether its data is live.
- `POST /player-identities/resolve` accepts `{ sport, players }` and returns
  versioned results, counts, provider provenance, and a resolution timestamp.

See the [sports data provider evaluation](../../docs/SPORTS_DATA_PROVIDER_EVALUATION.md)
for the live-data decision gate.

## Phase 3F.2 football player-data preview

Sports Hub includes a read-only football adapter backed by fictional,
SportsDataIO-shaped fixture data. It proves the provider contract for stable
IDs, projections, injuries, schedules, freshness, rejected-row isolation, and
source attribution without making a network request or claiming that the data
is live. Roster status and injury designation remain separate fields.

The default `SPORTS_DATA_PROVIDER` remains `offline-sample`, which intentionally
lacks projections, injuries, and schedules. Developers may explicitly select
`sportsdataio-football-fixture` to exercise the complete offline contract. The
unqualified `sportsdataio-football` provider name is unsupported and stays
disabled until commercial rights, caching, retention, and display terms are
approved.

Player-data endpoints under `/api/sports-hub`:

- `GET /player-data/status` reports provider capabilities, fixture/live state,
  license state, supported sports, and whether previews are ready.
- `POST /teams/:teamId/player-data/preview` compares a saved football roster
  with provider-shaped projections, injury reports, and games. The response is
  marked `previewOnly`, `persisted: false`, and `canApply: false`; it never
  changes the saved team or runs paid recommendations.

Invalid, duplicate, malformed, and cross-sport fixture rows are rejected
individually. Every projection retains its scoring period, season, provider
player ID, source update time, and deterministic freshness result. Stale and
missing data are surfaced as plain-language warnings rather than silently used.

## Phase 3G saved check-ins and progress

Every new analysis stores an immutable version 2 analysis snapshot. From the
result screen, a user may explicitly save that analysis as a versioned team
check-in. Check-ins retain the exact Team Score output, component scores,
confidence, roster roles, user-supplied projections, player availability
statuses, input checksum, and source provenance that existed at that moment.
They never contain recommendation details.
If two adjacent check-ins use different Team Score versions, roster and
projection evidence still compares, but the overall and component scores are
explicitly marked non-comparable.

The phone-first progress screen at `/sports-hub/history/` compares each saved
check-in with the previous one for the same team. It reports Team Score and
projection movement, component changes, players added or removed, starter and
bench changes, and availability-status changes. The first check-in is clearly
labeled as a baseline. Old scores are never recalculated with a newer scoring
formula.

Check-ins are separately persisted in `logs/sports-hub/check-ins.json` with
260-record retention and default-profile isolation. Saving the same analysis
twice is idempotent, and an analysis ID cannot be reused for another team.

Check-in endpoints under `/api/sports-hub`:

- `POST /teams/:teamId/check-ins` accepts `{ analysisId }` and saves or returns
  the matching check-in.
- `GET /teams/:teamId/check-ins` returns the saved team plus a newest-first
  comparison timeline.

The standard builder now uses a stable ID derived from sport, league, and team
name so later analyses of that same team build one history. Changing those
identifying fields intentionally starts a separate team timeline.

## Phase 3H–3J private mini-leagues, roles, and score proposals

The phone-first mini-league screen at `/sports-hub/leagues/` supports football,
basketball, and soccer. A local user can create a league, receive a friend join
code plus separate commissioner and member keys once, join with the friend code,
optionally link a saved same-sport team, and record or propose official fantasy
point totals for scheduled matchups.

League records use the `sports-hub-mini-league/1.2` schema and persist separately
in `logs/sports-hub/mini-leagues.json`. Only SHA-256 hashes of the friend code,
commissioner key, and member keys are stored. Manager names and linked teams are
unique within a league, leagues are capped at 12 managers, and membership locks
after the first approved matchup result is recorded. Version 1.0 records migrate
into a commissioner-unclaimed state; version 1.1 members migrate into an access
reissue state.

Schedules use a deterministic round-robin rotation for the configured number of
scoring periods. Standings are derived from completed matchup totals and ranked
by wins, ties, point differential, points for, and a stable name/ID fallback.
Team Score does not affect standings. Manager Score and AI ranking are explicit
reserved fields with `null` values.

The commissioner key is required to record or correct a result, rotate the
friend code, and lock or unlock a scoring period. A period can be locked only
after all of its scheduled matchups have results. Result changes, code rotation,
access claims, and period locks append plain-language events to a 500-entry
audit window; corrections retain both the prior and replacement totals. The
browser stores a successfully entered key in `sessionStorage` for convenience,
never in the league API response or server persistence.

Each manager receives a separate member key. It can submit a proposed score only
for a matchup involving that manager. Proposals are bounded to 200 records and
do not affect official results or standings until commissioner approval. A
commissioner can reject a proposal, approve one while superseding competing
pending proposals, replace any member key, or replace the commissioner key.

Mini-league endpoints under `/api/sports-hub`:

- `POST /mini-leagues` creates a league and returns the three plaintext secrets
  required by the creator once.
- `GET /mini-leagues/status` reports the active authorization and storage
  adapters without claiming hosted readiness.
- `GET /mini-leagues` lists local profile leagues without either secret hash.
- `GET /mini-leagues/:leagueId` returns a league and derived standings.
- `POST /mini-leagues/join` adds a manager before scoring begins.
- `POST /mini-leagues/:leagueId/commissioner/verify` verifies the
  `X-Mini-League-Commissioner-Key` header.
- `POST /mini-leagues/:leagueId/commissioner/claim` performs the one-time local
  migration claim for a legacy-unclaimed league.
- `POST /mini-leagues/:leagueId/commissioner/rotate` replaces and revokes the
  current commissioner key.
- `POST /mini-leagues/:leagueId/member/verify` verifies the
  `X-Mini-League-Member-Key` header and returns the matching manager identity.
- `POST /mini-leagues/:leagueId/members/:memberId/access/rotate` replaces one
  member key under commissioner authorization.
- `POST /mini-leagues/:leagueId/join-code/rotate` invalidates the previous
  friend code and returns the replacement once.
- `POST /mini-leagues/:leagueId/matchups/:matchupId/proposals` creates a pending
  participant proposal without changing standings.
- `PUT /mini-leagues/:leagueId/proposals/:proposalId` approves or rejects a
  proposal under commissioner authorization.
- `GET /mini-leagues/:leagueId/export` downloads a commissioner-authorized
  `sports-hub-league-export/1.0` bundle with all access material removed.
- `PUT /mini-leagues/:leagueId/scoring-periods/:period/lock` locks or unlocks a
  period using `{ "locked": true | false }`.
- `PUT /mini-leagues/:leagueId/matchups/:matchupId/score` records or explicitly
  replaces both official point totals. Commissioner routes require the key
  header.

This phase is intentionally local and account-free. Friend codes are joining
convenience, and commissioner/member keys are local capability credentials—not
user accounts, identity proof, recovery, or multi-device sessions. The next
hosted phase must connect per-user authentication, Row Level Security, and
transactional storage before public invite links or payments. There are no
automatic roster changes or live provider claims. See
[`docs/HOSTED_BETA_SETUP.md`](../../docs/HOSTED_BETA_SETUP.md) for the owner
setup checklist.

## Phase 3K hosted account foundation

The phone-first account screen at `/sports-hub/account/` stays in an honest
local-mode state until `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are set.
Once configured, it supports Supabase email magic links and one-time codes. The
browser may retain the provider session, but Sports Hub calls Supabase from the
server to verify the access token before returning a minimal user identity.

Account endpoints under `/api/sports-hub`:

- `GET /auth/status` reports whether hosted authentication is configured,
  without returning any key.
- `GET /auth/config` returns only the browser-safe project URL and publishable
  key when configured.
- `GET /auth/me` requires an `Authorization: Bearer` token and verifies it with
  Supabase before returning ID, normalized email, display name, and email
  verification state.

The tracked `supabase/migrations/20260825000000_sports_hub_accounts.sql`
migration creates normalized hosted profiles, leagues, memberships, invite
digests, matchups, score proposals, and events. Anonymous grants are revoked,
all seven tables enable Row Level Security, and security-definer database
functions explicitly check authenticated ownership or matchup participation
for league creation, joining, score proposals, and approvals. Raw friend codes
are not stored.

This is an activation-ready boundary, not a claim that accounts or hosted
league syncing are live. The JSON-backed league experience remains unchanged
until the staging project is configured, the migration and pgTAP contract pass,
and owner/member/stranger behavior is verified across two devices.
