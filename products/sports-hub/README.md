# AI Sports & Fantasy Hub

This product provides a local-first Team Analyzer for fantasy football and
basketball, then will support an internal mini-league and optional future AI
assistance.

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
