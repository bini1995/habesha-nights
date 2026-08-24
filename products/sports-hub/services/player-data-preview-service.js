const {
  PLAYER_DATA_SCHEMA_VERSION
} = require("../domain/player-data");

const {
  normalizeSport
} = require("../domain/sports");

const {
  createPlayerDataProvider
} = require("./player-data-provider");

const REQUIRED_PREVIEW_CAPABILITIES = Object.freeze([
  "PLAYER_DIRECTORY",
  "PROJECTIONS",
  "INJURIES",
  "SCHEDULES"
]);

class PlayerDataCapabilityError extends Error {}

function freezePreview(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(freezePreview);
  }
  return value;
}

function indexBy(records, field) {
  return new Map(records.map((record) => [record[field], record]));
}

function createPlayerDataPreviewService({
  now = () => new Date(),
  provider = createPlayerDataProvider()
} = {}) {
  function status() {
    const metadata = provider.status();
    const missingCapabilities = REQUIRED_PREVIEW_CAPABILITIES.filter(
      (capability) => !metadata.capabilities.includes(capability)
    );
    return freezePreview({
      fixtureOnly: metadata.fixtureOnly,
      liveData: metadata.live,
      missingCapabilities,
      previewReady: missingCapabilities.length === 0,
      provider: metadata,
      readOnly: true,
      schemaVersion: PLAYER_DATA_SCHEMA_VERSION
    });
  }

  async function previewTeam(team) {
    if (!team || typeof team !== "object" || Array.isArray(team)) {
      throw new Error("A saved team is required for player-data preview.");
    }
    const sport = normalizeSport(team.sport);
    const providerStatus = status();
    if (!providerStatus.previewReady) {
      throw new PlayerDataCapabilityError(
        `Player-data preview is unavailable; ${providerStatus.missingCapabilities.join(", ")} are not configured.`
      );
    }
    if (
      providerStatus.provider.sports.length > 0 &&
      !providerStatus.provider.sports.includes(sport)
    ) {
      throw new PlayerDataCapabilityError(
        `${providerStatus.provider.name} does not support ${sport}.`
      );
    }

    const [directory, projections, injuries, schedule] = await Promise.all([
      provider.listPlayers({ sport }),
      provider.getProjections({ sport }),
      provider.getInjuries({ sport }),
      provider.getSchedule({ sport })
    ]);
    const directoryByCanonicalId = indexBy(directory, "id");
    const directoryByProviderId = indexBy(directory, "providerPlayerId");
    const projectionsByProviderId = indexBy(
      projections.records,
      "providerPlayerId"
    );
    const injuriesByProviderId = indexBy(
      injuries.records,
      "providerPlayerId"
    );
    const gamesByTeam = new Map();
    schedule.records.forEach((game) => {
      gamesByTeam.set(game.homeTeam, game);
      gamesByTeam.set(game.awayTeam, game);
    });

    const warnings = new Set();
    if (providerStatus.fixtureOnly) {
      warnings.add(
        "This preview uses fictional offline fixture data, not current sports information."
      );
    }

    [projections, injuries, schedule].forEach((collection) => {
      if (collection.rejectedCount > 0) {
        warnings.add(
          `${collection.rejectedCount} invalid ${collection.dataType.toLocaleLowerCase()} record(s) were isolated.`
        );
      }
    });

    const roster = team.roster.map((slot) => {
      const confirmedIdentity = slot.player.identity;
      const identityDirectoryPlayer =
        confirmedIdentity?.providerId === providerStatus.provider.id
          ? directoryByProviderId.get(confirmedIdentity.providerPlayerId)
          : null;
      const confirmedDirectoryPlayer =
        identityDirectoryPlayer?.id === slot.player.id
          ? identityDirectoryPlayer
          : null;
      const directoryPlayer = confirmedDirectoryPlayer ??
        directoryByCanonicalId.get(slot.player.id) ?? null;
      const matchMethod = confirmedDirectoryPlayer
        ? "CONFIRMED_PROVIDER_ID"
        : directoryPlayer
          ? "CANONICAL_ID"
          : "UNMATCHED";
      const providerPlayerId = directoryPlayer?.providerPlayerId ?? null;
      const projection = providerPlayerId
        ? projectionsByProviderId.get(providerPlayerId) ?? null
        : null;
      const injury = providerPlayerId
        ? injuriesByProviderId.get(providerPlayerId) ?? null
        : null;
      const game = directoryPlayer?.teamLabel
        ? gamesByTeam.get(directoryPlayer.teamLabel) ?? null
        : null;

      if (!directoryPlayer) {
        warnings.add(`${slot.player.name} could not be mapped to the provider fixture.`);
      } else if (identityDirectoryPlayer && !confirmedDirectoryPlayer) {
        warnings.add(
          `${slot.player.name}'s confirmed provider ID did not match the canonical player and was ignored.`
        );
      } else if (!projection) {
        warnings.add(`${slot.player.name} has no provider projection.`);
      } else if (projection.freshness.status === "STALE") {
        warnings.add(`${slot.player.name}'s provider projection is stale.`);
      }
      if (injury?.freshness.status === "STALE") {
        warnings.add(`${slot.player.name}'s injury report is stale.`);
      }

      return {
        comparison: {
          difference: projection && slot.projection?.projectedFantasyPoints != null
            ? Number((
              projection.projectedFantasyPoints -
              slot.projection.projectedFantasyPoints
            ).toFixed(2))
            : null,
          providerProjectedFantasyPoints:
            projection?.projectedFantasyPoints ?? null,
          savedProjectedFantasyPoints:
            slot.projection?.projectedFantasyPoints ?? null
        },
        game,
        injury,
        match: {
          method: matchMethod,
          providerPlayerId
        },
        player: {
          id: slot.player.id,
          name: slot.player.name,
          position: slot.player.position,
          savedStatus: slot.player.status
        },
        projection,
        role: slot.role,
        slotId: slot.id
      };
    });

    const matchedCount = roster.filter(
      (slot) => slot.match.method !== "UNMATCHED"
    ).length;
    const projectionCount = roster.filter((slot) => slot.projection).length;
    const staleProjectionCount = roster.filter(
      (slot) => slot.projection?.freshness.status === "STALE"
    ).length;

    return freezePreview({
      canApply: false,
      generatedAt: now().toISOString(),
      persisted: false,
      previewOnly: true,
      provider: providerStatus.provider,
      roster,
      schemaVersion: PLAYER_DATA_SCHEMA_VERSION,
      sport,
      summary: {
        matchedCount,
        playerCount: roster.length,
        projectionCount,
        rejectedRecordCount:
          projections.rejectedCount +
          injuries.rejectedCount +
          schedule.rejectedCount,
        staleProjectionCount
      },
      teamId: team.id,
      warnings: [...warnings]
    });
  }

  return Object.freeze({
    previewTeam,
    status
  });
}

module.exports = {
  PlayerDataCapabilityError,
  REQUIRED_PREVIEW_CAPABILITIES,
  createPlayerDataPreviewService
};
