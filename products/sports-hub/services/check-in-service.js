const {
  compareTeamCheckIns,
  createTeamCheckIn
} = require("../domain/team-check-in");

class CheckInNotFoundError extends Error {}

function createCheckInService({ analysisStore, checkInStore, now = () => new Date() }) {
  async function create({ analysisId, profileId = "default", teamId }) {
    if (typeof analysisId !== "string" || analysisId.trim() === "") {
      throw new Error("analysisId is required to save a check-in.");
    }
    const existing = await checkInStore.findByAnalysisId(analysisId, profileId);
    if (existing) {
      if (existing.teamId !== teamId) {
        throw new CheckInNotFoundError("Analysis not found for this team.");
      }
      const records = await checkInStore.list(teamId, profileId);
      const index = records.findIndex(
        (record) => record.checkInId === existing.checkInId
      );
      return Object.freeze({
        checkIn: existing,
        comparison: compareTeamCheckIns(existing, records[index + 1] ?? null),
        created: false
      });
    }

    const analysisRecord = await analysisStore.get(analysisId, profileId);
    if (!analysisRecord || analysisRecord.teamId !== teamId) {
      throw new CheckInNotFoundError("Analysis not found for this team.");
    }
    if (!analysisRecord.outputSnapshot) {
      throw new CheckInNotFoundError(
        "This older analysis cannot be saved as a check-in. Run a fresh analysis first."
      );
    }
    const previous = (await checkInStore.list(teamId, profileId))[0] ?? null;
    const checkIn = createTeamCheckIn({ analysisRecord, now });
    await checkInStore.save(checkIn, profileId);
    return Object.freeze({
      checkIn,
      comparison: compareTeamCheckIns(checkIn, previous),
      created: true
    });
  }

  async function timeline(teamId, profileId = "default") {
    const records = await checkInStore.list(teamId, profileId);
    return Object.freeze(records.map((checkIn, index) => Object.freeze({
      checkIn,
      comparison: compareTeamCheckIns(checkIn, records[index + 1] ?? null)
    })));
  }

  return Object.freeze({
    create,
    timeline
  });
}

module.exports = {
  CheckInNotFoundError,
  createCheckInService
};
