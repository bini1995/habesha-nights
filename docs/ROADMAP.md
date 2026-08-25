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
- [x] Add a fictional SportsDataIO-shaped football adapter with stable IDs,
  projections, injuries, schedules, freshness, and isolated invalid rows.
- [x] Add a non-persisting saved-team player-data preview that keeps provider
  facts separate from user inputs and recommendations.
- [x] Add immutable, explicit team check-ins that preserve historical score,
  component, roster, projection, availability, and provenance evidence.
- [x] Add deterministic comparisons and a phone-first progress timeline without
  persisting or leaking recommendation details.
- Add one licensed live provider adapter only after commercial-use permission
  is confirmed.
- [x] Build read-only roster analysis and lineup recommendations first.
- [x] Add versioned private mini-league creation, membership, deterministic
  round-robin schedules, manual official-point results, and derived standings.
- [x] Add a phone-first league home with explicit create/join flows, one-time
  private codes, saved-team links, matchup entry, and score-separation copy.
- [x] Require a separate one-time commissioner key for result and settings
  changes, persist only its hash, and support browser-session unlocks.
- [x] Add commissioner-controlled join-code rotation, completed-period locks,
  explicit result corrections, and a bounded append-only audit trail.
- [x] Migrate local version 1.0 leagues safely and expose provider-neutral
  authorization and storage readiness without claiming hosted accounts.
- [x] Issue separate member access keys, allow matchup participants to propose
  scores, and require commissioner approval before standings change.
- [x] Add commissioner/member key rotation, proposal decisions, proposal audit
  receipts, and a downloadable migration bundle with all secrets removed.
- [x] Migrate version 1.1 leagues into explicit member-access reissue state.
- [x] Add opt-in Supabase email authentication configuration with a dedicated
  phone-first account page and server-verified user identity endpoint.
- [x] Add a versioned hosted league schema for profiles, memberships, private
  invite digests, matchups, score proposals, and audit events.
- [x] Enable Row Level Security on every hosted table, remove anonymous table
  grants, and add checked create, join, propose, and approve database functions.
- [x] Add offline provider tests, migration-contract tests, and a pgTAP policy
  contract without claiming the remote migration has been deployed.
- Keep AI advice explainable and require confirmation for roster changes.

## Phase 4 — AI scoring and ranking

- Version scoring rules and preserve the inputs behind every score.
- Evaluate recommendations against historical outcomes.
- Add confidence, provenance, and human-readable explanations.
- Keep experimental AI rankings separate from official mini-league standings
  until explicitly enabled.

## Immediate next slice

Create and link the Supabase staging project, apply the tracked migration, and
add `SUPABASE_URL` plus the publishable key through local environment settings.
Then connect the existing mini-league service to user-scoped hosted storage,
import the secret-free local migration bundle while reissuing access, add
recovery and rate limits, and run authorization tests across two real devices.
Preserve offline local mode and do not add payments until those hosted
ownership, security, privacy, and recovery paths pass.

In parallel, obtain written commercial-display and derived-score rights plus a
development key before adding a real football network client. That client must
remain disabled by default until timeout, retry, rate-limit, cache, retention,
and contract-parity checks pass.
