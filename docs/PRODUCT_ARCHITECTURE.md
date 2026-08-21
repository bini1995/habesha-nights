# Product Architecture

This repository will house three related products with explicit boundaries.
They may share infrastructure, but they must not import each other's domain
logic directly.

## Product boundaries

### Opportunity Agent

The existing production application. It owns watches, monitoring providers,
snapshots, change detection, events, notifications, scheduling, and the
current dashboard/API.

Current code remains at the repository root while it is stabilized. Moving it
under a product directory should be a later, mechanical change with
compatibility tests.

### NYC Event Finder

A discovery and recommendation product. It will own event-source ingestion,
event normalization, deduplication, preference matching, recommendations, and
saved events. Discovery results are not Opportunity Agent watch snapshots.

### AI Sports & Fantasy Hub

A fantasy football and basketball assistant. It will own sports data
adapters, roster and matchup advice, an internal mini-league, and eventually
AI-generated scoring and ranking. AI explanations must be separated from
deterministic league rules and scoring calculations.

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
