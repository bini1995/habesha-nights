# Sports Hub

Sports Hub is the primary product interface at `/`, with `/sports-hub/` kept as
a compatibility URL. It offers separate,
indexable football, basketball, and soccer Team Analyzer portals plus an advanced
CSV/JSON import workflow at `/sports-hub/import/`.

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

When image extraction is configured, users may upload a roster screenshot and
review the visible names before saving. A separate deterministic identity step
then links clear matches, asks the user to resolve duplicate or similar names,
and leaves unknown players unlinked. The current directory is fictional sample
data; it does not provide live projections, injuries, or schedules.
