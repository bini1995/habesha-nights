# NYC Event Finder

This product discovers and normalizes events in New York City.

Its domain will include event sources, normalized events, deduplication,
preferences, recommendations, and saved events. It will not reuse monitoring
snapshots as an event catalog or place discovery logic inside monitoring
providers.

See `docs/ROADMAP.md` for the MVP sequence.

## NYC Parks catalog API

The first source is the official NYC Parks Public Events – Upcoming 14 Days
dataset (`w3wp-dpdi`). It is public and does not require an API key.

- `POST /api/event-finder/refresh` fetches and persists the current source data.
- `GET /api/event-finder/events` reads only the persisted catalog.
- Read filters: `borough`, `category`, `source`, `startsAfter`, `startsBefore`,
  and `limit` (1–5000). The dashboard requests the complete two-week catalog
  so its local text search covers every persisted event.

The catalog is written atomically to `logs/event-finder/catalog.json`, which is
covered by the existing Docker `./logs:/app/logs` volume.

## Personalization and quality APIs

Phase 2B remains single-user, represented internally by a `default` profile.
Each concern has a separate atomic store under `logs/event-finder/`:

- `preferences.json` stores preferred boroughs, categories, keywords, and the
  past-event visibility setting.
- `saved-events.json` stores full event snapshots. Saving never changes
  `catalog.json`, and a snapshot remains available after its source event
  leaves the rolling catalog.
- `quality.json` stores the latest ingestion counts, rejected rows,
  deduplication, borough/category coverage, event range, and freshness data.
- `quality-history.json` stores the latest 90 successful refresh summaries so
  quality trends remain bounded and inspectable.

API routes:

- `GET|PUT /api/event-finder/preferences`
- `GET|POST /api/event-finder/saved-events`
- `DELETE /api/event-finder/saved-events/:eventId`
- `GET /api/event-finder/recommendations`
- `GET /api/event-finder/quality`
- `GET /api/event-finder/quality/history` (optional `limit`, up to 90)
- `GET /api/event-finder/saved-events/:eventId/calendar.ics`
- `GET /api/event-finder/saved-events/calendar.ics`

Recommendations are deterministic and keyless. Category matches score 30,
borough matches score 20, and each keyword match scores 10. Results are then
ordered by score and start time, exclude saved events, optionally exclude past
events, and always include plain-language match reasons. When no preference
matches, the next upcoming events remain discoverable with an upcoming-soon
reason.

Saved-event calendar downloads use RFC 5545 CRLF line endings, escaping and
line folding. They include an `America/New_York` timezone definition and emit
local start/end values from the saved snapshot, including events that end the
following morning. Both individual and combined downloads are generated from
saved snapshots, not the rolling catalog.
