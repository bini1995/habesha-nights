# Sports Hub

Sports Hub is the primary product interface at `/sports-hub/`. It offers separate,
indexable football, basketball, and soccer Team Analyzer portals plus an advanced
CSV/JSON import workflow at `/sports-hub/import/`.

The guided builder asks for team basics, players, and a final review. Results show
a deterministic 0–100 Team Score, grade, component breakdown, completeness,
plain-language strengths and weaknesses, and up to two complete recommendations
for the default free entitlement. Additional recommendation details are removed
from the server response, not hidden in the browser.

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
