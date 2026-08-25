const test = require("node:test");
const assert = require("node:assert/strict");

const { createDashboardApp } = require("../services/dashboard");
const {
  HostedAuthenticationError,
  createHostedAuthProvider,
  normalizeProjectUrl,
  normalizePublishableKey,
  readHostedAuthConfiguration
} = require("../products/sports-hub/services/hosted-auth-provider");

const PUBLISHABLE_KEY = `sb_publishable_${"a".repeat(32)}`;
const ACCESS_TOKEN = "token_" + "b".repeat(64);

test("hosted auth stays disabled until both public settings exist", () => {
  const provider = createHostedAuthProvider({ environment: {} });
  assert.deepEqual(provider.status(), {
    schemaVersion: "sports-hub-hosted-auth/1.0",
    id: "supabase-email-otp",
    mode: "LOCAL_ONLY",
    configured: false,
    configurationError: null,
    missing: ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY"],
    loginMethods: ["EMAIL_OTP", "EMAIL_MAGIC_LINK"],
    serverIdentityVerification: false,
    hostedLeaguePersistence: false
  });
  assert.deepEqual(provider.publicConfiguration(), {
    schemaVersion: "sports-hub-hosted-auth/1.0",
    configured: false,
    configurationError: null,
    provider: "SUPABASE",
    url: null,
    publishableKey: null,
    loginMethods: ["EMAIL_OTP", "EMAIL_MAGIC_LINK"]
  });
});

test("invalid optional settings fail closed without crashing local Sports Hub", () => {
  const provider = createHostedAuthProvider({
    environment: {
      SUPABASE_URL: "https://sample.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: `sb_secret_${"x".repeat(32)}`
    }
  });
  assert.equal(provider.status().configured, false);
  assert.match(provider.status().configurationError, /never a secret/);
  assert.equal(provider.publicConfiguration().publishableKey, null);
});

test("hosted auth accepts HTTPS and localhost but rejects secret browser keys", () => {
  assert.equal(
    normalizeProjectUrl("https://sample.supabase.co/"),
    "https://sample.supabase.co"
  );
  assert.equal(normalizeProjectUrl("http://localhost:54321"), "http://localhost:54321");
  assert.throws(() => normalizeProjectUrl("http://example.com"), /must use HTTPS/);
  assert.equal(normalizePublishableKey(PUBLISHABLE_KEY), PUBLISHABLE_KEY);
  assert.throws(
    () => normalizePublishableKey(`sb_secret_${"x".repeat(32)}`),
    /never a secret or legacy service-role key/
  );
});

test("server verifies a token with Supabase and exposes only safe user fields", async () => {
  const calls = [];
  const provider = createHostedAuthProvider({
    environment: {
      SUPABASE_URL: "https://sample.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE_KEY,
      SUPABASE_SECRET_KEY: `sb_secret_${"z".repeat(32)}`
    },
    createClientImpl(url, key, options) {
      calls.push({ key, options, url });
      return {
        auth: {
          async getUser(token) {
            calls.push({ token });
            return {
              data: {
                user: {
                  id: "90f04c48-f7e2-4b07-8960-c9c468f24470",
                  email: "PERSON@EXAMPLE.COM",
                  email_confirmed_at: "2026-08-25T12:00:00.000Z",
                  user_metadata: {
                    display_name: "Avery",
                    private_note: "never returned"
                  }
                }
              },
              error: null
            };
          }
        }
      };
    }
  });

  assert.deepEqual(await provider.verifyAccessToken(ACCESS_TOKEN), {
    id: "90f04c48-f7e2-4b07-8960-c9c468f24470",
    email: "person@example.com",
    displayName: "Avery",
    emailVerified: true
  });
  assert.equal(calls[0].key, PUBLISHABLE_KEY);
  assert.equal(calls[0].options.auth.persistSession, false);
  assert.equal(calls[1].token, ACCESS_TOKEN);
  assert.equal(JSON.stringify(calls).includes("sb_secret_"), false);
});

test("auth APIs never expose the server secret and require a verified bearer token", async (context) => {
  const hostedAuthProvider = {
    status() {
      return {
        configured: true
      };
    },
    publicConfiguration() {
      return {
        configured: true,
        provider: "SUPABASE",
        url: "https://sample.supabase.co",
        publishableKey: PUBLISHABLE_KEY
      };
    },
    async verifyAccessToken(token) {
      if (token !== ACCESS_TOKEN) {
        throw new HostedAuthenticationError("Sign in again to continue.");
      }
      return {
        id: "90f04c48-f7e2-4b07-8960-c9c468f24470",
        email: "person@example.com",
        displayName: null,
        emailVerified: true
      };
    }
  };
  const server = createDashboardApp({
    sportsHubOptions: { hostedAuthProvider }
  }).listen(0, "127.0.0.1");
  context.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const configuration = await fetch(`${base}/api/sports-hub/auth/config`);
  const configurationText = await configuration.text();
  assert.equal(configuration.status, 200);
  assert.equal(configuration.headers.get("cache-control"), "no-store");
  assert.doesNotMatch(configurationText, /sb_secret_/);
  assert.match(configurationText, /sb_publishable_/);

  const rejected = await fetch(`${base}/api/sports-hub/auth/me`);
  assert.equal(rejected.status, 401);
  assert.match(rejected.headers.get("cache-control"), /private/);

  const accepted = await fetch(`${base}/api/sports-hub/auth/me`, {
    headers: { authorization: `Bearer ${ACCESS_TOKEN}` }
  });
  assert.equal(accepted.status, 200);
  assert.equal((await accepted.json()).user.email, "person@example.com");
});

test("internal configuration tracks secret presence without retaining its value", () => {
  const configuration = readHostedAuthConfiguration({
    SUPABASE_URL: "https://sample.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: `sb_secret_${"q".repeat(32)}`
  });
  assert.equal(configuration.secretConfigured, true);
  assert.equal(Object.hasOwn(configuration, "secretKey"), false);
});
