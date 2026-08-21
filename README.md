# Sports Hub

Sports Hub is the primary product in this repository: a mobile-first fantasy
team analyzer for football, basketball, and soccer. It gives users a clear,
versioned Team Score, roster strengths, and server-protected recommendations
without requiring a fantasy-platform connection.

The original Opportunity Agent monitoring service and NYC Event Finder remain
available as Labs products with their existing APIs, persistence, and URLs.

## Sports Hub

- Phone-first guided lineup builder and offline sample teams
- Football, basketball, and soccer support
- Consent-based roster screenshot extraction with a required review step
- Explainable 0–100 Team Score with completeness and confidence
- Two complete free recommendations with premium details removed server-side
- Advanced user-provided CSV and JSON imports
- Privacy-safe share summaries and cards

Open <http://localhost:3000> or the compatible `/sports-hub/` URL.

## Labs: Opportunity Agent

- Browser-based monitoring with Playwright
- Config-driven, multi-watch provider architecture
- Multi-date availability scanning
- Snapshot-based change detection
- Email notifications and a real-time WebSocket dashboard
- Background scheduling and rate-limit handling
- Watch CRUD API and per-watch state storage

## Current Provider

The AMC provider can monitor a movie, theater, and format across future show
dates and alert when matching tickets become available.

## Project Structure

```text
config/
  watches.json
routes/
services/
  providers/
    index.js
    amc.js
  monitor.js
  scheduler.js
  snapshot-store.js
  compare.js
  event-engine.js
  email.js
public/
products/
docs/
index.js
```

## Running Locally

```bash
npm install
npm test
npm start
```

The monitoring dashboard is available at <http://localhost:3000/opportunity-agent/>.
NYC Event Finder remains at <http://localhost:3000/event-finder/>.

## Adding a Watch

Use the dashboard/API or add an entry to `config/watches.json`:

```json
{
  "id": "example-watch",
  "provider": "AMC",
  "enabled": true,
  "movie": "Example Movie",
  "theater": "Example Theater",
  "format": "IMAX",
  "pageUrl": "https://www.amctheatres.com/example"
}
```

## Docker

```bash
docker compose build
docker compose up -d
docker compose ps
docker compose logs -f
```

Stop the service with `docker compose down`.

## Deployment boundaries

Sports Hub is always mounted. Legacy background processes remain enabled by
default so current behavior does not change:

- `LEGACY_MONITORING_ENABLED=false` prevents the AMC scheduler from starting.
- `EVENT_FINDER_ENABLED=false` prevents the Event Finder API router from mounting.

These flags are intended for a future sports-only public deployment. They do
not delete legacy code or data. The Labs pages and persisted files should be
handled independently by deployment routing when a process is disabled. See
[the product architecture](docs/PRODUCT_ARCHITECTURE.md) and
[incremental roadmap](docs/ROADMAP.md).

## Secrets

Copy `.env.example` to `.env` for local configuration. Never commit
`.env` or API keys. Rotate any credential that may previously have been
shared outside the local environment.

Roster screenshot extraction is optional. Set `OPENAI_API_KEY` to enable it;
`OPENAI_VISION_MODEL` defaults to `gpt-5.4-mini`. The browser accepts PNG,
JPEG, and WebP images up to 6 MB. Sports Hub sends an image to OpenAI only
after the user checks the disclosure, requests `store: false`, never saves the
raw image, and requires the user to review extracted players before a team can
be submitted. AI extraction may misread cropped or unclear screenshots.
