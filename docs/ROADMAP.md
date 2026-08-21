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
- [x] Add versioned user-provided CSV, JSON, and offline-sample imports behind
  preview and explicit confirmation stages.
- [x] Persist separate import metadata, checksums, normalized import snapshots,
  freshness, and immutable analysis input snapshots.
- [x] Add import history/details, snapshot reanalysis, downloadable templates,
  and an accessible import wizard.
- [x] Make Sports Hub the primary product entry point with separate football,
  basketball, and soccer portals.
- [x] Add a guided three-step roster builder, polished consumer results,
  privacy-safe sharing, and reduced-motion responsive layouts.
- [x] Extend deterministic Team Score analysis to soccer using only supplied
  projections, without claiming a universal official soccer scoring system.
- [x] Serve Sports Hub directly at `/` while preserving `/sports-hub/` and move
  legacy products into a quiet Labs navigation boundary.
- [x] Fix hidden-step mobile validation across every sport with visible errors,
  focus movement, backward navigation, and correction coverage.
- [x] Add a compact phone-first landing page, sticky builder actions, optional
  league names, session-scoped drafts, and incomplete-analysis language.
- [x] Add explicit configuration boundaries for future sports-only deployments
  without changing default AMC or Event Finder behavior.
- [x] Add consent-based PNG, JPEG, and WebP roster screenshot extraction with
  strict structured output, transient image handling, and editable previews.
- [x] Require confirmation and normal domain validation before an extracted
  roster can be persisted or analyzed.
- [x] Add canonical player identity matching with aliases, typo candidates,
  duplicate-name handling, position disambiguation, and explicit user review.
- [x] Preserve identity provenance on confirmed teams and invalidate the link
  when a user edits the matched name or position.
- [x] Add a provider-neutral capability boundary for player directories,
  projections, injuries, and schedules with a fictional offline adapter.
- Add one licensed live provider adapter only after commercial-use permission
  is confirmed.
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

Evaluate a SportsDataIO development integration against the provider contract,
using only scrambled trial fixtures until commercial display and derived-score
rights are confirmed. Map stable player IDs, projections, injuries, schedules,
freshness, and source attribution for one sport first. Do not expose a live-data
feature flag until licensing, caching, and redistribution terms are documented.
Then add saved analysis comparison while preserving the Labs products.
