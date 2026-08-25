# Sports Hub

Sports Hub is the primary product interface at `/`, with `/sports-hub/` kept as
a compatibility URL. It offers separate,
indexable football, basketball, and soccer Team Analyzer portals plus an advanced
CSV/JSON import workflow at `/sports-hub/import/`. Private local mini-leagues
live at `/sports-hub/leagues/`, and the opt-in hosted account entry point lives
at `/sports-hub/account/`.

The guided builder asks for team basics, players, and a final review. Results show
a deterministic 0–100 Team Score, grade, component breakdown, completeness,
plain-language strengths and weaknesses, and up to two complete recommendations
for the default free entitlement. Additional recommendation details are removed
from the server response, not hidden in the browser.

Users can explicitly save any new analysis as an immutable check-in and revisit
it from the phone-first progress screen at `/sports-hub/history/`. The timeline
compares Team Score, supplied projection totals, roster membership, lineup
roles, and availability statuses with the previous saved snapshot. Historical
results retain their original scoring version and are not recalculated later.
Recommendation details are excluded from check-in persistence.

Mini-leagues provide explicit create and join flows for football, basketball,
and soccer. A creator receives an unambiguous eight-character friend code, a
commissioner key, and their own member key once; only their SHA-256 hashes are
persisted. Each joining manager receives a separate member key once.
Membership remains open until the first result is recorded. Deterministic
round-robin matchups are regenerated whenever a manager joins before that lock.

League standings are derived only from approved official fantasy point totals.
A manager key may propose totals only for a matchup that manager played, and a
proposal never changes standings until commissioner approval. Commissioner
authorization is required to approve or reject proposals, record or correct
totals directly, rotate access, and lock or unlock a completed scoring period.
Corrections and proposal decisions preserve audit receipts. Team Score never
affects a win, loss, tie, points-for total, or rank. Manager Score and AI ranking
remain uncalculated. Local leagues still have no cross-device identity, public
invitations, payments, or automatic roster actions. Phase 3K adds email login
and server identity verification, but it does not claim hosted league syncing
until the staging database is connected.

## What the numbers mean

- **Team Score** measures roster quality from supplied projections, positional
  coverage, depth, and available risk data. It is deterministic and versioned.
- **Official fantasy points** are the points defined by a user's league. They are
  displayed separately and never treated as Team Score.
- **Manager Score** is reserved for a future manager-performance product and is
  not calculated.
- **AI ranking** is reserved for future research and is not calculated.

Soccer analysis supports GK, DEF, MID, and FWD. Because soccer fantasy formats
vary, Sports Hub does not invent a universal official scoring system; its soccer
Team Score normalizes the projected points the user supplies.

Share summaries and downloadable cards include sport, team name, score, grade,
and strongest component. They do not contain roster names or private input data.
No platform credentials or external provider connection is required.

Check-ins are stored separately from teams, imports, and analyses under the
ignored Docker-backed `logs/sports-hub/` persistence boundary. They are scoped
to the default profile and retained for 260 records. Saving the same analysis
again is idempotent.

Mini-leagues use another independent atomic store at
`logs/sports-hub/mini-leagues.json`, scoped to the default profile and bounded
to 100 leagues. Friend-code, commissioner-key, and member-key plaintext are
never written to the store. Successfully entered access keys are kept in
browser `sessionStorage` only, so they remain local conveniences rather than
hosted account sessions. Commissioner-authorized migration downloads explicitly
exclude every access hash and require new hosted access to be issued.

Hosted account configuration is a separate provider boundary. With no Supabase
settings, `/sports-hub/account/` explains that local mode remains active and
does not show a broken login form. With `SUPABASE_URL` and a new publishable key,
the page supports email links or codes and the server validates access tokens
with the Auth provider before returning a minimal user identity. The server
does not authorize from the browser's cached session object.

The tracked Supabase migration defines seven normalized tables plus owner/member
helper policies and atomic create, join, propose, and proposal-resolution
functions. Anonymous table access is revoked and every table has Row Level
Security. The schema is activation-ready, not evidence that a remote project
has already been provisioned.

When image extraction is configured, users may upload a roster screenshot and
review the visible names before saving. A separate deterministic identity step
then links clear matches, asks the user to resolve duplicate or similar names,
and leaves unknown players unlinked. The current directory is fictional sample
data; it does not provide live projections, injuries, or schedules.
