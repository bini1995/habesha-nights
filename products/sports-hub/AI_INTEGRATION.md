# AI Integration Boundary

AI advice will be an optional application service layered over persisted
league, roster, player, matchup, and scoring data. It must not calculate or
silently alter official mini-league scores.

The planned integration will use the OpenAI Responses API. The model will
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
belongs in source control; AI endpoints remain disabled until explicit
configuration is added.

Official reference:
<https://developers.openai.com/api/reference/resources/responses/methods/create>
