const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

const {
  RosterImageConfigurationError,
  RosterImageValidationError,
  createRosterImageParser,
  validateImageDataUrl
} = require("../products/sports-hub/services/roster-image-parser");

const {
  createSportsHubRouter
} = require("../products/sports-hub");

const PNG_DATA_URL = "data:image/png;base64,iVBORw0KGgo=";

async function withServer(router, run) {
  const app = express();
  app.use(express.json({ limit: "9mb" }));
  app.use("/api/sports-hub", router);
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });

  try {
    await run(`http://127.0.0.1:${server.address().port}/api/sports-hub`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("validates roster image types, signatures, and consent", async () => {
  assert.equal(validateImageDataUrl(PNG_DATA_URL).mimeType, "image/png");
  assert.throws(
    () => validateImageDataUrl("data:image/png;base64,aGVsbG8="),
    RosterImageValidationError
  );
  assert.throws(
    () => validateImageDataUrl("data:image/gif;base64,R0lGODlh"),
    /PNG, JPEG, or WebP/
  );

  const parser = createRosterImageParser({
    apiKey: "test-key",
    fetchImpl: async () => {
      throw new Error("should not be called");
    }
  });

  await assert.rejects(
    parser.parse({ imageDataUrl: PNG_DATA_URL, sport: "football" }),
    /Confirm that this image may be sent to OpenAI/
  );
  await assert.rejects(
    parser.parse({
      consent: true,
      imageDataUrl: PNG_DATA_URL,
      sport: "hockey"
    }),
    RosterImageValidationError
  );
});

test("requires configuration without exposing or persisting an image", async () => {
  const parser = createRosterImageParser({ apiKey: "" });
  assert.equal(parser.status().enabled, false);
  assert.equal(parser.status().model, null);
  await assert.rejects(
    parser.parse({
      consent: true,
      imageDataUrl: PNG_DATA_URL,
      sport: "football"
    }),
    RosterImageConfigurationError
  );
});

test("sends a non-stored image request and normalizes structured roster output", async () => {
  let request;
  const parser = createRosterImageParser({
    apiKey: "test-key",
    fetchImpl: async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return {
        ok: true,
        async json() {
          return {
            id: "resp_roster_test",
            output: [{
              content: [{
                type: "output_text",
                text: JSON.stringify({
                  sport: "FOOTBALL",
                  teamName: "Phone Champs",
                  leagueName: null,
                  players: [{
                    name: "Alex Carter",
                    position: "QB",
                    role: "STARTER",
                    projectedFantasyPoints: null,
                    status: "ACTIVE",
                    confidence: 0.94,
                    sourceText: "QB Alex Carter"
                  }, {
                    name: "Jordan Miles",
                    position: "UNKNOWN",
                    role: "UNKNOWN",
                    projectedFantasyPoints: null,
                    status: "UNKNOWN",
                    confidence: 0.61,
                    sourceText: "Jordan Miles"
                  }],
                  warnings: ["One lineup role was unclear."]
                })
              }]
            }]
          };
        }
      };
    }
  });

  const result = await parser.parse({
    consent: true,
    imageDataUrl: PNG_DATA_URL,
    sport: "football"
  });

  assert.equal(request.url, "https://api.openai.com/v1/responses");
  assert.equal(request.options.headers.authorization, "Bearer test-key");
  assert.equal(request.body.store, false);
  assert.equal(request.body.model, "gpt-5.4-mini");
  assert.equal(request.body.input[0].content[1].type, "input_image");
  assert.equal(request.body.text.format.type, "json_schema");
  assert.equal(result.extraction.players.length, 2);
  assert.equal(result.extraction.players[1].position, "UNKNOWN");
  assert.equal(result.responseId, "resp_roster_test");
});

test("handles malformed upstream responses without exposing provider details", async () => {
  const parser = createRosterImageParser({
    apiKey: "test-key",
    fetchImpl: async () => ({
      ok: true,
      async json() {
        throw new SyntaxError("unexpected provider payload");
      }
    })
  });

  await assert.rejects(
    parser.parse({
      consent: true,
      imageDataUrl: PNG_DATA_URL,
      sport: "football"
    }),
    /response was not usable/
  );
});

test("roster image API exposes status and delegates parsing without saving a team", async () => {
  let parsedBody;
  const rosterImageParser = {
    status() {
      return {
        enabled: true,
        maxBytes: 1024,
        model: "test-model",
        schemaVersion: "test-schema",
        supportedTypes: ["image/png"]
      };
    },
    async parse(body) {
      parsedBody = body;
      return {
        extraction: {
          leagueName: null,
          players: [],
          sport: "SOCCER",
          teamName: null,
          warnings: ["No readable players were found in this image."]
        },
        model: "test-model",
        responseId: "test-response",
        schemaVersion: "test-schema"
      };
    }
  };

  await withServer(
    createSportsHubRouter({
      rosterImageParser,
      teamStore: {
        async list() {
          return [];
        }
      }
    }),
    async (base) => {
      const status = await fetch(`${base}/roster-images/status`);
      assert.equal(status.status, 200);
      assert.equal((await status.json()).enabled, true);

      const parsed = await fetch(`${base}/roster-images/parse`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          consent: true,
          imageDataUrl: PNG_DATA_URL,
          sport: "SOCCER"
        })
      });

      assert.equal(parsed.status, 200);
      assert.equal((await parsed.json()).extraction.sport, "SOCCER");
      assert.equal(parsedBody.consent, true);

      const teams = await fetch(`${base}/teams`);
      assert.equal((await teams.json()).count, 0);
    }
  );
});
