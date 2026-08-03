# NYC Opportunity Agent

A configurable monitoring agent that watches websites for changes and sends real-time alerts when opportunities become available.

Originally built to monitor AMC IMAX 70MM movie ticket releases, the system evolved into a general-purpose opportunity monitoring framework.

## Features

- Browser-based monitoring with Playwright
- Config-driven watchers
- Multi-date availability scanning
- Snapshot-based change detection
- Email notifications
- Real-time dashboard with WebSockets
- Background scheduling
- Rate-limit handling
- Per-watch state storage

## Architecture

                Config
                  |
                  v
          Watch Management
                  |
                  v
          Provider Watcher
                  |
                  v
          Snapshot Storage
                  |
                  v
         Change Detection Engine
                  |
                  v
          Event Notification
                  |
                  v
          Email + Dashboard

## Current Watcher

### AMC Movie Tickets

Example use case:

- Monitor The Odyssey
- AMC Lincoln Square 13
- IMAX 70MM
- Scan future show dates
- Alert when tickets become available

## Project Structure

.
├── config/
│   └── watches.json        # Watch configurations
│
├── watchers/
│   └── amc.js              # AMC Playwright watcher
│
├── services/
│   ├── monitor.js          # Monitoring engine
│   ├── scheduler.js        # Background scheduler
│   ├── snapshot-store.js   # Historical state
│   ├── compare.js          # Change detection
│   ├── event-engine.js     # Event generation
│   └── email.js             # Notifications
│
├── logs/
│   └── latest/             # Current watch state
│
└── index.js                # Application entry point

## Running Locally

Install dependencies:

```bash
npm install
Start application:
npm start
Dashboard:
http://localhost:3000
Adding a Watch
Add a configuration entry:
{
  "id": "example-watch",
  "provider": "AMC",
  "enabled": true,
  "movie": "Example Movie",
  "theater": "Example Theater",
  "format": "IMAX"
}
Future Directions
Potential monitoring categories:
Movie and concert tickets
Broadway releases
Job postings
Apartment listings
Product availability
Flight price changes
The goal is to create a general opportunity detection platform.

## Docker

Build and start the application:

```bash
docker compose build
docker compose up -d
Check status:
docker compose ps
View logs:
docker compose logs -f
Stop:
docker compose down
The dashboard is available at:
http://localhost:3000
