const sampleDirectory = require("../fixtures/player-directory.json");

const PLAYER_DATA_PROVIDER_VERSION = "sports-hub-player-data-provider/1.0";
const PLAYER_DATA_CAPABILITIES = Object.freeze([
  "PLAYER_DIRECTORY",
  "PROJECTIONS",
  "INJURIES",
  "SCHEDULES"
]);

class PlayerDataProvider {
  constructor(metadata) {
    this.metadata = Object.freeze({
      capabilities: Object.freeze([...(metadata.capabilities ?? [])]),
      fixtureOnly: Boolean(metadata.fixtureOnly),
      id: metadata.id,
      licenseStatus: metadata.licenseStatus ?? null,
      live: Boolean(metadata.live),
      mode: metadata.mode,
      name: metadata.name,
      providerVersion: PLAYER_DATA_PROVIDER_VERSION,
      sports: Object.freeze([...(metadata.sports ?? [])]),
      updatedAt: metadata.updatedAt ?? null
    });
  }

  status() {
    return this.metadata;
  }

  async listPlayers() {
    throw new Error(`${this.metadata.id} does not implement PLAYER_DIRECTORY.`);
  }

  async getProjections() {
    throw new Error(`${this.metadata.id} does not implement PROJECTIONS.`);
  }

  async getInjuries() {
    throw new Error(`${this.metadata.id} does not implement INJURIES.`);
  }

  async getSchedule() {
    throw new Error(`${this.metadata.id} does not implement SCHEDULES.`);
  }
}

class OfflineSamplePlayerDataProvider extends PlayerDataProvider {
  constructor({ directory = sampleDirectory } = {}) {
    if (directory?.schemaVersion !== "sports-hub-player-directory/1.0") {
      throw new Error("The offline player directory schema is not supported.");
    }
    super(directory.provider);
    this.players = Object.freeze([...(directory.players ?? [])]);
  }

  async listPlayers({ sport }) {
    return this.players.filter((player) => player.sport === sport);
  }
}

function createPlayerDataProvider({
  name = process.env.SPORTS_DATA_PROVIDER || "offline-sample"
} = {}) {
  const normalized = String(name).trim().toLowerCase();
  if (normalized === "offline-sample") {
    return new OfflineSamplePlayerDataProvider();
  }
  if (normalized === "sportsdataio-football-fixture") {
    const {
      SportsDataIOFootballFixtureProvider
    } = require("./sportsdataio-football-fixture-provider");
    return new SportsDataIOFootballFixtureProvider();
  }
  throw new Error(`Unsupported sports data provider: "${name}".`);
}

module.exports = {
  PLAYER_DATA_CAPABILITIES,
  PLAYER_DATA_PROVIDER_VERSION,
  OfflineSamplePlayerDataProvider,
  PlayerDataProvider,
  createPlayerDataProvider
};
