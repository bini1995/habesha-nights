# NYC Opportunity Agent

A configurable monitoring agent that watches websites for changes and sends
real-time alerts when opportunities become available. It was originally built
for AMC IMAX 70MM ticket releases and now provides a general monitoring
foundation.

## Features

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

The dashboard is available at <http://localhost:3000>.

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

## Product Evolution

This repository is evolving into a modular suite:

- **Opportunity Agent** — the existing monitoring platform
- **NYC Event Finder** — event discovery and recommendations
- **AI Sports & Fantasy Hub** — football and basketball assistance,
  mini-leagues, and future AI scoring/ranking

The existing application remains the only running product while compatibility
coverage is expanded. See [the product architecture](docs/PRODUCT_ARCHITECTURE.md)
and [incremental roadmap](docs/ROADMAP.md).

## Secrets

Copy `.env.example` to `.env` for local configuration. Never commit
`.env` or API keys. Rotate any credential that may previously have been
shared outside the local environment.
