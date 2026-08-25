# Product Architecture

This repository houses Sports Hub as its primary customer product plus two
preserved Labs products with explicit boundaries.
They may share infrastructure, but they must not import each other's domain
logic directly.

## Product boundaries

### Sports Hub (primary)

The root experience and primary brand. It owns fantasy sport models, local
teams, imports, analysis snapshots, immutable team check-ins, Team Score,
recommendations, entitlements, private local mini-leagues, official-point
matchups, derived standings,
the consent-based roster image extraction boundary, and the football,
basketball, and soccer interfaces. `/sports-hub/` remains a compatibility URL
while `/` serves the same landing experience directly.

Roster images are transient AI inputs. The browser requires a user disclosure,
the server validates type, size, and file signature, and the Responses API call
uses `store: false`. Sports Hub persists neither the image nor the unconfirmed
extraction. Only a roster that the user reviews and submits may enter normal
team persistence. The OpenAI credential remains server-side.

Player identity resolution is a separate deterministic step after image
transcription. It normalizes names and aliases, considers the selected sport
and position, and returns matched, ambiguous, or unmatched results. A user must
resolve ambiguity explicitly. Confirmed teams may persist canonical IDs plus
provider provenance; editing the name or position in the interface removes the
link. Existing manually entered teams remain valid with no identity metadata.

The `PlayerDataProvider` boundary advertises individual capabilities for player
directories, projections, injuries, and schedules. The default adapter exposes
only a fictional offline directory. No adapter may claim live data or supply
projections until its commercial-use rights and source mappings are reviewed.

Team check-ins are a separate persistence boundary from teams and analysis
inputs. Each check-in freezes the result version and minimal comparison
evidence, while the progress service calculates deterministic changes against
the prior check-in for the same profile and team. Recommendation payloads do
not enter this store, preserving the entitlement boundary.

Mini-leagues have their own versioned persistence and service boundary. Saved
teams may be linked to members only when profile and sport match, but leagues do
not import Team Score or recommendation data into matchups. A deterministic
schedule is domain output, and standings are recalculated exclusively from
entered official fantasy points. Friend-code and commissioner-key hashes are
persisted; plaintext secrets are returned only when created or rotated.
Commissioner authorization protects scoring and settings. Separate member keys
allow only matchup participants to propose a result, and standings remain
unchanged until a commissioner approves it. Period locks, key rotation, proposal
decisions, and a 500-entry audit window preserve local result integrity. Version
1.0 commissioner access migrates to an explicitly unclaimed state; version 1.1
member access migrates to a reissue state. A portable export excludes all key
hashes so hosted identity must issue fresh access. Authorization and persistence
expose status interfaces for future adapters, but the current local profile and
session keys are not an authentication system.
Public sharing and multi-device hosting remain disabled until hosted identity,
ownership, recovery, and transactional storage are connected and tested.

Phase 3K introduces `HostedAuthProvider` as a separate Supabase boundary. Its
public configuration contains only the project URL and publishable key; token
identity is independently verified server-side. The account interface remains
in local mode when these values are absent. A tracked Postgres migration models
hosted profiles, leagues, memberships, owner-only invite digests, matchups,
score proposals, and audit events. Database functions make create/join and
proposal decisions atomic, while Row Level Security and explicit grants provide
defense in depth. The existing JSON league store remains active until staging
deployment and two-device authorization tests pass.

### Opportunity Agent (Labs)

The existing production application. It owns watches, monitoring providers,
snapshots, change detection, events, notifications, scheduling, and the
current dashboard/API.

Current code remains at the repository root while it is stabilized. Moving it
under a product directory should be a later, mechanical change with
compatibility tests.

### NYC Event Finder (Labs)

A discovery and recommendation product. It will own event-source ingestion,
event normalization, deduplication, preference matching, recommendations, and
saved events. Discovery results are not Opportunity Agent watch snapshots.

Runtime boundaries are deliberately provider-neutral. A sports-only deployment
may set `LEGACY_MONITORING_ENABLED=false` and `EVENT_FINDER_ENABLED=false`.
Both default to enabled; neither flag deletes persistence or source code.

## Shared code policy

Code belongs in a shared package only after at least two products need the
same stable capability. Suitable candidates include configuration loading,
logging, persistence primitives, and notification delivery. Product-specific
models, provider adapters, and business rules remain inside their product.

Cross-product interaction should happen through versioned service interfaces
or events. Avoid reaching into another product's storage or internal modules.

## Proposed target layout

```text
products/
  opportunity-agent/
  event-finder/
  sports-hub/
packages/
  shared/
docs/
```

This is a target, not an instruction to move the working application now.
Incremental extraction protects the current Docker deployment and dashboard.
