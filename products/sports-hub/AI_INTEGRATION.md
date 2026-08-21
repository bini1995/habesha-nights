# AI Integration Boundary

AI advice remains an optional future application service layered over persisted
league, roster, player, matchup, and scoring data. It must not calculate or
silently alter official mini-league scores.

Roster screenshot extraction is the first active AI boundary. It uses image
input plus strict Structured Outputs to transcribe visible team and player
fields into an editable preview. It does not score the team, make roster
decisions, invent projections, or persist its raw image or raw response.
Extraction requires an explicit in-product disclosure and uses `store: false`.
Normal domain validation applies only after the user reviews and submits the
preview.

Future advice will also use the OpenAI Responses API. The model will
receive narrowly scoped read tools for current roster, player, schedule,
injury, and matchup data. Recommendations will use Structured Outputs so the
application can validate a stable response shape before displaying it.

Initial assistant capabilities:

- Explain start/sit and add/drop recommendations.
- Compare players using cited input data and confidence.
- Identify incomplete or stale data instead of guessing.
- Propose transactions that always require user confirmation.

Every stored recommendation should record its model, prompt version, input
data version, generated time, confidence, and explanation. No API credential
belongs in source control. Screenshot extraction remains disabled until
`OPENAI_API_KEY` is configured.

Official reference:
<https://developers.openai.com/api/reference/resources/responses/methods/create>
