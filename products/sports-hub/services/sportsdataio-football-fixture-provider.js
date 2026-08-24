const defaultFixture = require("../fixtures/sportsdataio-football.json");

const {
  createInjuryRecord,
  createPlayerDataEnvelope,
  createProjectionRecord,
  createScheduleRecord
} = require("../domain/player-data");

const {
  PlayerDataProvider
} = require("./player-data-provider");

const FIXTURE_SCHEMA_VERSION = "sportsdataio-football-fixture/1.0";

function requireFootball(value) {
  const sport = String(value ?? "FOOTBALL").trim().toUpperCase();
  if (sport !== "FOOTBALL") {
    throw new Error("The football fixture provider supports FOOTBALL only.");
  }
  return sport;
}

function requireFixture(fixture) {
  if (fixture?.schemaVersion !== FIXTURE_SCHEMA_VERSION) {
    throw new Error("The SportsDataIO-shaped football fixture is not supported.");
  }
  return fixture;
}

function mapRows(rows, mapRow, uniqueKey) {
  const records = [];
  const rejectedRecords = [];
  const seen = new Set();

  (rows ?? []).forEach((row, index) => {
    try {
      const record = mapRow(row);
      const keys = [uniqueKey(record)].flat();
      const duplicateKey = keys.find((key) => seen.has(key));
      if (duplicateKey) {
        throw new Error(`Duplicate normalized record: ${duplicateKey}.`);
      }
      keys.forEach((key) => seen.add(key));
      records.push(record);
    } catch (error) {
      rejectedRecords.push({ index, reason: error.message });
    }
  });

  return { records, rejectedRecords };
}

class SportsDataIOFootballFixtureProvider extends PlayerDataProvider {
  constructor({ fixture = defaultFixture, now = () => new Date() } = {}) {
    const checkedFixture = requireFixture(fixture);
    super(checkedFixture.provider);
    this.fixture = checkedFixture;
    this.now = now;
  }

  async listPlayers({ sport = "FOOTBALL" } = {}) {
    requireFootball(sport);
    const { records } = mapRows(
      this.fixture.players,
      (row) => {
        requireFootball(row.Sport);
        const firstName = String(row.FirstName ?? "").trim();
        const lastName = String(row.LastName ?? "").trim();
        const name = `${firstName} ${lastName}`.trim();
        const position = String(row.Position ?? "").toUpperCase();
        const teamLabel = String(row.Team ?? "").trim();
        if (!name || !row.SportsHubPlayerID || !row.PlayerID || !teamLabel) {
          throw new Error("Player identity fields are incomplete.");
        }
        if (!Array.isArray(row.Aliases)) {
          throw new Error("Player aliases must be an array.");
        }
        if (!["QB", "RB", "WR", "TE", "K", "DST", "FLEX"].includes(position)) {
          throw new Error("Player position is not supported for FOOTBALL.");
        }
        return Object.freeze({
          aliases: Object.freeze([...row.Aliases]),
          id: String(row.SportsHubPlayerID),
          name,
          position,
          providerPlayerId: String(row.PlayerID),
          sourceUpdatedAt: new Date(row.Updated).toISOString(),
          sport: "FOOTBALL",
          teamLabel
        });
      },
      (record) => [
        `provider:${record.providerPlayerId}`,
        `canonical:${record.id}`
      ]
    );
    return records;
  }

  async getProjections({ sport = "FOOTBALL" } = {}) {
    const normalizedSport = requireFootball(sport);
    const provider = this.status();
    const mapped = mapRows(
      this.fixture.projections,
      (row) => {
        requireFootball(row.Sport);
        return createProjectionRecord({
          canonicalPlayerId: row.SportsHubPlayerID,
          projectedFantasyPoints: row.FantasyPoints,
          providerId: provider.id,
          providerPlayerId: row.PlayerID,
          scoringPeriod: row.ScoringPeriod,
          season: row.Season,
          source: "SPORTSDATAIO_SHAPED_FIXTURE",
          sourceUpdatedAt: row.Updated,
          sport: row.Sport
        }, { now: this.now });
      },
      (record) =>
        `projection:${record.providerPlayerId}:${record.season}:${record.scoringPeriod}`
    );
    return createPlayerDataEnvelope({
      dataType: "PROJECTIONS",
      fetchedAt: this.now().toISOString(),
      provider,
      sport: normalizedSport,
      ...mapped
    });
  }

  async getInjuries({ sport = "FOOTBALL" } = {}) {
    const normalizedSport = requireFootball(sport);
    const provider = this.status();
    const mapped = mapRows(
      this.fixture.injuries,
      (row) => {
        requireFootball(row.Sport);
        return createInjuryRecord({
          bodyPart: row.BodyPart,
          canonicalPlayerId: row.SportsHubPlayerID,
          injuryStatus: row.InjuryStatus,
          note: row.Note,
          providerId: provider.id,
          providerPlayerId: row.PlayerID,
          rosterStatus: row.RosterStatus,
          sourceUpdatedAt: row.Updated,
          sport: row.Sport
        }, { now: this.now });
      },
      (record) => `injury:${record.providerPlayerId}`
    );
    return createPlayerDataEnvelope({
      dataType: "INJURIES",
      fetchedAt: this.now().toISOString(),
      provider,
      sport: normalizedSport,
      ...mapped
    });
  }

  async getSchedule({ sport = "FOOTBALL" } = {}) {
    const normalizedSport = requireFootball(sport);
    const provider = this.status();
    const mapped = mapRows(
      this.fixture.schedule,
      (row) => {
        requireFootball(row.Sport);
        return createScheduleRecord({
          awayTeam: row.AwayTeam,
          gameId: row.GameKey,
          homeTeam: row.HomeTeam,
          providerId: provider.id,
          scheduledAt: row.DateTime,
          scoringPeriod: row.Week,
          season: row.Season,
          sourceUpdatedAt: row.Updated,
          sport: row.Sport,
          status: row.Status
        }, { now: this.now });
      },
      (record) => `game:${record.gameId}`
    );
    return createPlayerDataEnvelope({
      dataType: "SCHEDULES",
      fetchedAt: this.now().toISOString(),
      provider,
      sport: normalizedSport,
      ...mapped
    });
  }
}

module.exports = {
  FIXTURE_SCHEMA_VERSION,
  SportsDataIOFootballFixtureProvider
};
