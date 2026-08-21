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
