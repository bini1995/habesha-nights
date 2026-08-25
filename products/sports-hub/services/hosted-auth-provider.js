const { createClient } = require("@supabase/supabase-js");

const HOSTED_AUTH_SCHEMA_VERSION = "sports-hub-hosted-auth/1.0";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class HostedAuthConfigurationError extends Error {}
class HostedAuthenticationError extends Error {}

function normalizeProjectUrl(value) {
  const candidate = String(value ?? "").trim();
  if (!candidate) return "";

  let url;
  try {
    url = new URL(candidate);
  } catch {
    throw new HostedAuthConfigurationError(
      "SUPABASE_URL must be a valid HTTPS URL or a localhost development URL."
    );
  }

  const localhost = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(localhost && url.protocol === "http:")) {
    throw new HostedAuthConfigurationError(
      "SUPABASE_URL must use HTTPS outside local development."
    );
  }

  return url.toString().replace(/\/$/, "");
}

function normalizePublishableKey(value) {
  const key = String(value ?? "").trim();
  if (!key) return "";
  if (!key.startsWith("sb_publishable_") || key.length < 32) {
    throw new HostedAuthConfigurationError(
      "SUPABASE_PUBLISHABLE_KEY must contain a new sb_publishable_ browser key, never a secret or legacy service-role key."
    );
  }
  return key;
}

function normalizeEmail(value) {
  const email = String(value ?? "").trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email) || email.length > 254) return null;
  return email;
}

function readHostedAuthConfiguration(environment = process.env) {
  const url = normalizeProjectUrl(environment.SUPABASE_URL);
  const publishableKey = normalizePublishableKey(
    environment.SUPABASE_PUBLISHABLE_KEY
  );
  const configured = Boolean(url && publishableKey);
  const missing = [];
  if (!url) missing.push("SUPABASE_URL");
  if (!publishableKey) missing.push("SUPABASE_PUBLISHABLE_KEY");

  return Object.freeze({
    configured,
    missing: Object.freeze(missing),
    publishableKey,
    secretConfigured: Boolean(String(environment.SUPABASE_SECRET_KEY ?? "").trim()),
    url
  });
}

function publicUser(user) {
  const displayName = String(
    user?.user_metadata?.display_name ??
    user?.user_metadata?.full_name ??
    ""
  ).trim();
  return Object.freeze({
    id: String(user.id),
    email: normalizeEmail(user.email),
    displayName: displayName ? displayName.slice(0, 80) : null,
    emailVerified: Boolean(user.email_confirmed_at)
  });
}

function createHostedAuthProvider({
  environment = process.env,
  createClientImpl = createClient
} = {}) {
  let configuration;
  try {
    configuration = {
      ...readHostedAuthConfiguration(environment),
      configurationError: null
    };
  } catch (error) {
    if (!(error instanceof HostedAuthConfigurationError)) throw error;
    configuration = {
      configured: false,
      configurationError: error.message,
      missing: Object.freeze([]),
      publishableKey: "",
      secretConfigured: Boolean(
        String(environment.SUPABASE_SECRET_KEY ?? "").trim()
      ),
      url: ""
    };
  }
  const client = configuration.configured
    ? createClientImpl(configuration.url, configuration.publishableKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false
      }
    })
    : null;

  function status() {
    return Object.freeze({
      schemaVersion: HOSTED_AUTH_SCHEMA_VERSION,
      id: "supabase-email-otp",
      mode: configuration.configured ? "SUPABASE_STAGING" : "LOCAL_ONLY",
      configured: configuration.configured,
      configurationError: configuration.configurationError,
      missing: configuration.missing,
      loginMethods: Object.freeze(["EMAIL_OTP", "EMAIL_MAGIC_LINK"]),
      serverIdentityVerification: configuration.configured,
      hostedLeaguePersistence: false
    });
  }

  function publicConfiguration() {
    return Object.freeze({
      schemaVersion: HOSTED_AUTH_SCHEMA_VERSION,
      configured: configuration.configured,
      configurationError: configuration.configurationError,
      provider: "SUPABASE",
      url: configuration.configured ? configuration.url : null,
      publishableKey: configuration.configured
        ? configuration.publishableKey
        : null,
      loginMethods: Object.freeze(["EMAIL_OTP", "EMAIL_MAGIC_LINK"])
    });
  }

  async function verifyAccessToken(value) {
    if (!configuration.configured) {
      throw new HostedAuthConfigurationError(
        configuration.configurationError ??
        "Hosted accounts are not configured yet. Local Sports Hub remains available."
      );
    }
    const accessToken = String(value ?? "").trim();
    if (accessToken.length < 32 || accessToken.length > 8192) {
      throw new HostedAuthenticationError("Sign in again to continue.");
    }

    let result;
    try {
      result = await client.auth.getUser(accessToken);
    } catch {
      throw new HostedAuthenticationError("Your session could not be verified.");
    }
    if (result.error || !result.data?.user?.id) {
      throw new HostedAuthenticationError("Your session is no longer valid.");
    }
    return publicUser(result.data.user);
  }

  return Object.freeze({
    publicConfiguration,
    status,
    verifyAccessToken
  });
}

module.exports = {
  HOSTED_AUTH_SCHEMA_VERSION,
  HostedAuthConfigurationError,
  HostedAuthenticationError,
  createHostedAuthProvider,
  normalizeProjectUrl,
  normalizePublishableKey,
  readHostedAuthConfiguration
};
