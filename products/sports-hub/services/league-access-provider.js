const crypto = require("crypto");

const LEAGUE_ACCESS_SCHEMA_VERSION = "sports-hub-league-access/1.0";

class LeagueAuthorizationError extends Error {}

function normalizeCommissionerKey(value) {
  const key = String(value ?? "").trim();
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(key)) {
    throw new LeagueAuthorizationError(
      "A valid commissioner key is required for this action."
    );
  }
  return key;
}

function hashCommissionerKey(value) {
  return crypto.createHash("sha256")
    .update(normalizeCommissionerKey(value))
    .digest("hex");
}

function safeHashMatch(left, right) {
  if (typeof left !== "string" || typeof right !== "string" ||
      left.length !== right.length) return false;
  return crypto.timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

function createLocalLeagueAccessProvider({
  createKey = () => crypto.randomBytes(32).toString("base64url")
} = {}) {
  function issueCommissionerKey() {
    return normalizeCommissionerKey(createKey());
  }

  function assertCommissioner(league, providedKey) {
    if (!league?.commissionerKeyHash) {
      throw new LeagueAuthorizationError(
        "Commissioner access has not been claimed for this legacy league."
      );
    }
    let providedHash;
    try {
      providedHash = hashCommissionerKey(providedKey);
    } catch {
      throw new LeagueAuthorizationError(
        "A valid commissioner key is required for this action."
      );
    }
    if (!safeHashMatch(league.commissionerKeyHash, providedHash)) {
      throw new LeagueAuthorizationError("The commissioner key is incorrect.");
    }
    return league.ownerMemberId;
  }

  function status() {
    return Object.freeze({
      schemaVersion: LEAGUE_ACCESS_SCHEMA_VERSION,
      id: "local-commissioner-key",
      mode: "LOCAL_CAPABILITY_KEY",
      authenticatedAccounts: false,
      multiDeviceSessions: false,
      commissionerAuthorization: true,
      hostedReady: false
    });
  }

  return {
    assertCommissioner,
    hashCommissionerKey,
    issueCommissionerKey,
    status
  };
}

module.exports = {
  LEAGUE_ACCESS_SCHEMA_VERSION,
  LeagueAuthorizationError,
  createLocalLeagueAccessProvider,
  hashCommissionerKey,
  normalizeCommissionerKey,
  safeHashMatch
};
