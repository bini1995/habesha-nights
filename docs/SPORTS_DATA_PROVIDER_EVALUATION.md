# Sports Data Provider Evaluation

## Current decision

No production player-data provider is selected. Sports Hub currently uses a
fictional offline directory to prove canonical identity matching and the user
review flow. It must never be presented as current sports information.

SportsDataIO is the first integration candidate to evaluate because its
official developer material covers NFL, NBA, and soccer APIs, publishes OpenAPI
contracts for all three, and documents player IDs, projections, injuries, and
schedules:

- [Developer access and licensing modes](https://sportsdata.io/developers)
- [NFL workflow and projection lifecycle](https://sportsdata.io/developers/workflow-guide/nfl)
- [NBA workflow and projection lifecycle](https://sportsdata.io/developers/workflow-guide/nba)
- [Soccer workflow and supported fantasy data](https://sportsdata.io/developers/workflow-guide/soccer)
- [Published OpenAPI files](https://sportsdata.io/developers/sports-data-open-api-swagger-files)

This is a candidate, not an approval. SportsDataIO states that development/free
trial feeds may contain scrambled data, its delayed self-service product is not
licensed for commercial redistribution and does not include soccer, and live
commercial access requires a sales agreement. Those constraints must be
resolved before showing real provider data to users.

## Commercial questions that must be answered

1. Does the license permit consumer display in a paid fantasy-advice product?
2. May Sports Hub calculate, store, and sell derived Team Scores and suggested
   point improvements?
3. Which NFL, NBA, and soccer competitions include player directories,
   projections, injuries, and schedules?
4. What caching, retention, deletion, attribution, and audit requirements apply?
5. Are stable player IDs preserved through transfers, team changes, and seasons?
6. How are custom league scoring rules reflected in fantasy projections?
7. What update frequency, rate limits, uptime commitments, and overage costs
   apply at an initial consumer-app scale?
8. May development and QA use scrambled fixtures in automated tests and demos?

## Adapter acceptance contract

A live adapter is not ready until it:

- advertises only capabilities it actually implements;
- maps provider IDs to immutable Sports Hub canonical IDs;
- preserves the source update timestamp and scoring period on every projection;
- keeps roster status distinct from game-day injury designation;
- rejects malformed, cross-sport, duplicated, and stale records independently;
- returns normalized offline fixtures for tests without making network calls;
- implements timeouts, bounded retries, rate-limit handling, and safe errors;
- records no API key, raw secret, or unauthorized provider payload in Git;
- passes contract tests for football before basketball and soccer are enabled;
- remains disabled in production until licensing approval is recorded.

## Recommended rollout

1. Obtain a development key and written answers to the commercial questions.
2. Build a read-only football player-directory adapter using scrambled fixtures.
3. Add football projections and injury mapping with freshness reporting.
4. Compare provider projections against the existing deterministic Team Score;
   provider data remains an input, never the score itself.
5. Repeat the contract for basketball and then selected soccer competitions.
6. Enable saved weekly comparisons before adding paid recommendations.
