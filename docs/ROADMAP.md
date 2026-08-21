# Incremental Roadmap

## Phase 0 — Stabilize the existing app

- Complete the provider registry migration.
- Add offline tests for watch validation, comparison, event generation,
  scheduler behavior, and snapshot storage.
- Separate unit tests from live browser and email smoke tests.
- Add a CI check that never requires credentials.
- Rotate the previously used Resend key and keep local secrets untracked.

## Phase 1 — Establish product seams

- Characterize the existing HTTP API and dashboard with compatibility tests.
- Move Opportunity Agent behind a product entry point without changing its
  routes, persisted data, port, or Docker service behavior.
- Introduce shared infrastructure only when a second product actually needs
  it.

## Phase 2 — NYC Event Finder MVP

- [x] Define a normalized event model and source-adapter contract.
- [x] Start with the official NYC Parks source and recorded fixtures.
- [x] Add persistent deduplication and date, borough, and category filters.
- [x] Expose a separate API namespace and responsive dashboard area.
- [x] Add catalog search, event details, official links, refresh controls, and
  accessible loading, empty, and error states.
- [x] Add separately persisted saved-event snapshots and validated preferences.
- [x] Add deterministic, explainable recommendations without AI or API keys.
- [x] Report ingestion quality, coverage, rejected rows, deduplication, and
  catalog freshness.
- [x] Add Discover, Recommended, and Saved dashboard views plus preferences.
- [x] Add bounded ingestion history and measurable source-quality trends.
- [x] Add standards-compliant individual and combined saved-event calendar
  exports with New York timezone semantics.
- [x] Add HTTP asset smoke tests and isolated watch CRUD/API coverage.

## Phase 3 — Sports & Fantasy Hub MVP

- [x] Define validated, immutable sport-neutral player, team, roster-slot,
  league-settings, projection, analysis, and recommendation models for
  football and basketball.
- [x] Add default-profile atomic team persistence and manual/JSON roster input.
- [x] Add deterministic Team Score v1.0.0 with component scores, confidence,
  explanations, and ranked replacement recommendations.
- [x] Enforce FREE/PREMIUM recommendation entitlements on the server without
  payment integration or premium-detail leakage.
- [x] Add Team Analyzer APIs, offline sport fixtures, and a responsive
  football-first interface.
- [x] Add persistence, validation, scoring, entitlement, API, and browser-asset
  compatibility tests.
- Add one licensed or user-provided data adapter behind an interface.
- [x] Build read-only roster analysis and lineup recommendations first.
- Add mini-league creation, membership, schedules, and deterministic scoring.
- Keep AI advice explainable and require confirmation for roster changes.

## Phase 4 — AI scoring and ranking

- Version scoring rules and preserve the inputs behind every score.
- Evaluate recommendations against historical outcomes.
- Add confidence, provenance, and human-readable explanations.
- Keep experimental AI rankings separate from official mini-league standings
  until explicitly enabled.

## Immediate next slice

Extend Sports Hub with saved analysis history and a CSV import adapter while
keeping provider connections offline. Continue Opportunity Agent stabilization
with scheduler, comparison, event, snapshot, and notification compatibility
coverage.
