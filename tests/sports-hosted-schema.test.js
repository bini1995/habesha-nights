const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");

const MIGRATION = path.join(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "20260825000000_sports_hub_accounts.sql"
);

test("hosted Sports Hub migration defines the normalized league tables", async () => {
  const sql = await fs.readFile(MIGRATION, "utf8");
  for (const table of [
    "sports_profiles",
    "sports_leagues",
    "sports_league_members",
    "sports_league_invites",
    "sports_league_matchups",
    "sports_score_proposals",
    "sports_league_events"
  ]) {
    assert.match(sql, new RegExp(`create table public\\.${table} \\(`));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security;`));
    assert.match(sql, new RegExp(`revoke all on table public\\.${table} from anon, authenticated;`));
  }
  assert.equal((sql.match(/enable row level security;/g) ?? []).length, 7);
  assert.match(sql, /foreign key \(league_id, matchup_id\)/);
  assert.match(sql, /sports_one_pending_proposal_per_manager/);
  assert.match(sql, /grant select on public\.sports_score_proposals to authenticated/);
  assert.doesNotMatch(sql, /grant [^;]*insert[^;]*sports_score_proposals/);
  assert.doesNotMatch(sql, /grant [^;]*update[^;]*sports_league_matchups/);
  assert.doesNotMatch(sql, /sb_secret_|service_role/);
});

test("hosted migration keeps joins and score decisions behind checked RPCs", async () => {
  const sql = await fs.readFile(MIGRATION, "utf8");
  for (const procedure of [
    "create_sports_league",
    "join_sports_league",
    "propose_sports_score",
    "resolve_sports_score_proposal"
  ]) {
    assert.match(sql, new RegExp(`function public\\.${procedure}\\(`));
  }
  assert.match(sql, /Only a matchup participant can propose its score/);
  assert.match(sql, /Only the league owner can resolve score proposals/);
  assert.match(sql, /SCORE_PROPOSAL_APPROVED/);
  assert.match(sql, /set search_path = ''/);
  assert.match(sql, /from public, anon;/);
  assert.match(sql, /to authenticated;/);
});

test("database test contract covers every hosted table and critical policy", async () => {
  const sql = await fs.readFile(
    path.join(__dirname, "..", "supabase", "tests", "database", "sports_hub_rls.test.sql"),
    "utf8"
  );
  assert.match(sql, /select plan\(24\)/);
  assert.equal((sql.match(/RLS enabled/g) ?? []).length, 7);
  assert.match(sql, /anonymous role cannot list leagues/);
  assert.match(sql, /proposal participant policy exists/);
  assert.match(sql, /proposal owner approval policy exists/);
});
