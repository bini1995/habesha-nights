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
