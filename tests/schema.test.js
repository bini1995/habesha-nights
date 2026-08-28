const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const migration = fs.readFileSync(path.join(__dirname, "..", "supabase", "migrations", "20260828000000_real_event_marketplace.sql"), "utf8");
const launchMigration = fs.readFileSync(path.join(__dirname, "..", "supabase", "migrations", "20260828010000_launch_analytics_claims.sql"), "utf8");
const seedMigration = fs.readFileSync(path.join(__dirname, "..", "supabase", "migrations", "20260828020000_verified_launch_events.sql"), "utf8");

test("marketplace migration creates every Phase 2 table", () => {
  for (const table of ["events", "organizers", "venues", "businesses", "cities", "event_categories", "outbound_clicks", "submissions"]) {
    assert.match(migration, new RegExp(`create table public\\.${table}\\b`, "i"));
  }
});

test("launch catalog contains 30 source-checked real listings and no mock fallback", () => {
  assert.match(seedMigration, /add column source_url text/i);
  assert.equal((seedMigration.match(/'30000000-0000-4000-8000-[0-9]{12}'/g) || []).length, 30);
  assert.equal((seedMigration.match(/'2026-08-27T16:00:00Z'/g) || []).length, 30);
  assert.doesNotMatch(seedMigration, /example\.com/i);
});

test("launch migration adds attribution, claims, and manual promotion leads", () => {
  for (const table of ["event_views", "event_claims", "promotion_requests"]) {
    assert.match(launchMigration, new RegExp(`create table public\\.${table}\\b`, "i"));
  }
  assert.match(launchMigration, /alter table public\.outbound_clicks\s+add column source/is);
  assert.match(launchMigration, /instagram.*tiktok.*google.*organizer.*whatsapp.*direct/s);
  assert.match(launchMigration, /quoted_price_cents integer not null default 3900/i);
});

test("moderation, RLS, approval transaction, and flyer bucket are migration-backed", () => {
  assert.match(migration, /draft.*pending.*approved.*rejected/s);
  assert.match(migration, /alter table public\.submissions enable row level security/i);
  assert.match(migration, /revoke all.*from anon, authenticated/is);
  assert.match(migration, /function public\.approve_event_submission/i);
  assert.match(migration, /event-flyers/);
});
