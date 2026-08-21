const {
  PLAYER_IDENTITY_SCHEMA_VERSION,
  resolvePlayerIdentity
} = require("../domain/player-identity");

const {
  normalizeSport
} = require("../domain/sports");

const {
  createPlayerDataProvider
} = require("./player-data-provider");

const MAX_IDENTITY_PLAYERS = 50;

function createPlayerIdentityService({
  provider = createPlayerDataProvider(),
  now = () => new Date()
} = {}) {
  function status() {
    const metadata = provider.status();
    return Object.freeze({
      enabled: metadata.capabilities.includes("PLAYER_DIRECTORY"),
      liveData: metadata.live,
      provider: metadata,
      schemaVersion: PLAYER_IDENTITY_SCHEMA_VERSION
    });
  }

  async function resolveRoster({ players, sport: requestedSport } = {}) {
    const sport = normalizeSport(requestedSport);
    if (!Array.isArray(players) || players.length === 0) {
      throw new Error("players requires at least one player.");
    }
    if (players.length > MAX_IDENTITY_PLAYERS) {
      throw new Error(`players supports at most ${MAX_IDENTITY_PLAYERS} players.`);
    }

    const directory = await provider.listPlayers({ sport });
    const providerMetadata = provider.status();
    const results = players.map((player, inputIndex) =>
      resolvePlayerIdentity(
        { ...player, sport },
        directory,
        providerMetadata,
        inputIndex
      )
    );
    const counts = results.reduce((summary, result) => {
      summary[result.status.toLocaleLowerCase()] += 1;
      return summary;
    }, { ambiguous: 0, matched: 0, unmatched: 0 });

    return Object.freeze({
      counts: Object.freeze(counts),
      provider: providerMetadata,
      resolvedAt: now().toISOString(),
      results: Object.freeze(results),
      schemaVersion: PLAYER_IDENTITY_SCHEMA_VERSION,
      sport
    });
  }

  return Object.freeze({
    resolveRoster,
    status
  });
}

module.exports = {
  MAX_IDENTITY_PLAYERS,
  createPlayerIdentityService
};
