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

- Define a normalized event model and source-adapter contract.
- Start with one permitted data source and recorded fixtures.
- Add deduplication, date/location/category filters, and saved preferences.
- Expose a separate API namespace and dashboard area.
- Add recommendations only after ingestion quality is measurable.

## Phase 3 — Sports & Fantasy Hub MVP

- Define sport-neutral league, team, roster, player, matchup, and transaction
  models with football and basketball extensions.
- Add one licensed or user-provided data adapter behind an interface.
- Build read-only roster analysis and lineup recommendations first.
- Add mini-league creation, membership, schedules, and deterministic scoring.
- Keep AI advice explainable and require confirmation for roster changes.

## Phase 4 — AI scoring and ranking

- Version scoring rules and preserve the inputs behind every score.
- Evaluate recommendations against historical outcomes.
- Add confidence, provenance, and human-readable explanations.
- Keep experimental AI rankings separate from official mini-league standings
  until explicitly enabled.

## Immediate next slice

Add unit coverage around watch CRUD validation without mutating the real
`config/watches.json`, then add API compatibility tests. After that, define
the Event Finder's normalized event schema and fixtures as the first new
product code.
