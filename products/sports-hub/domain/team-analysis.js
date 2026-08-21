const { createAvailablePlayer, createTeam, deepFreeze } = require("./models");

const TEAM_SCORE_VERSION = "1.0.0";
const BASELINE_PROJECTION = Object.freeze({ FOOTBALL: 20, BASKETBALL: 40 });
const WEIGHTS = Object.freeze({ starterStrength: 0.3, benchDepth: 0.15, positionalBalance: 0.2, projectedProduction: 0.25, availabilityRisk: 0.1 });

function clamp(value) { return Math.max(0, Math.min(100, value)); }
function round(value) { return Math.round(value * 10) / 10; }
function average(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
function points(slot) { return slot.projection?.projectedFantasyPoints ?? null; }

function positionMatches(required, actual) {
  if (required === actual || required === "UTIL") return true;
  if (required === "FLEX") return ["RB", "WR", "TE"].includes(actual);
  if (required === "G") return ["PG", "SG"].includes(actual);
  if (required === "F") return ["SF", "PF"].includes(actual);
  return false;
}

function grade(score) {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

function analyzeTeam(teamInput) {
  const team = createTeam(teamInput, { profileId: teamInput.profileId ?? "default" });
  const starters = team.roster.filter((slot) => slot.role === "STARTER");
  const bench = team.roster.filter((slot) => slot.role === "BENCH");
  const baseline = BASELINE_PROJECTION[team.sport];
  const starterValues = starters.map(points).filter((value) => value !== null);
  const benchValues = bench.map(points).filter((value) => value !== null);
  const allValues = team.roster.map(points).filter((value) => value !== null);
  const used = new Set();
  let filled = 0;
  for (const required of team.leagueSettings.starterPositions) {
    const match = starters.findIndex((slot, index) => !used.has(index) && positionMatches(required, slot.player.position));
    if (match >= 0) { used.add(match); filled += 1; }
  }
  const availabilityValues = team.roster.map((slot) => {
    if (slot.projection?.availability !== null && slot.projection?.availability !== undefined) return slot.projection.availability;
    if (slot.projection?.risk !== null && slot.projection?.risk !== undefined) return 1 - slot.projection.risk;
    if (slot.player.status === "OUT") return 0;
    if (slot.player.status === "DOUBTFUL") return 0.25;
    if (slot.player.status === "QUESTIONABLE") return 0.65;
    if (slot.player.status === "ACTIVE") return 1;
    return null;
  }).filter((value) => value !== null);
  const components = {
    starterStrength: clamp(average(starterValues) / baseline * 75),
    benchDepth: bench.length ? clamp(average(benchValues) / (baseline * 0.7) * 70) : 0,
    positionalBalance: clamp(filled / team.leagueSettings.starterPositions.length * 100),
    projectedProduction: clamp(average(allValues) / baseline * 80),
    availabilityRisk: availabilityValues.length ? clamp(average(availabilityValues) * 100) : 50
  };
  Object.keys(components).forEach((key) => { components[key] = round(components[key]); });
  const overallScore = round(Object.entries(WEIGHTS).reduce((sum, [key, weight]) => sum + components[key] * weight, 0));
  const projectionCompleteness = team.roster.length ? allValues.length / team.roster.length : 0;
  const riskCompleteness = team.roster.length ? availabilityValues.length / team.roster.length : 0;
  const completeness = round((projectionCompleteness * 0.8 + riskCompleteness * 0.2) * 100);
  const confidence = completeness >= 85 ? "HIGH" : completeness >= 60 ? "MEDIUM" : "LOW";
  const weakest = Object.entries(components).sort((a, b) => a[1] - b[1])[0];
  const reasons = [
    `Starter production contributes ${components.starterStrength} of 100.`,
    `${filled} of ${team.leagueSettings.starterPositions.length} required starter positions are covered.`,
    `${allValues.length} of ${team.roster.length} players include fantasy-point projections.`,
    `The weakest component is ${weakest[0]} at ${weakest[1]}.`
  ];
  return deepFreeze({
    type: "TEAM_ANALYSIS",
    teamId: team.id,
    sport: team.sport,
    teamScoreVersion: TEAM_SCORE_VERSION,
    overallScore,
    letterGrade: grade(overallScore),
    components,
    dataCompleteness: { percentage: completeness, confidence, projectedPlayers: allValues.length, rosterPlayers: team.roster.length },
    reasons,
    officialFantasyPoints: { label: team.leagueSettings.scoringLabel, projectedRosterTotal: round(allValues.reduce((sum, value) => sum + value, 0)) },
    managerScore: null,
    aiRanking: null
  });
}

function recommendImprovements(teamInput, availableInputs = []) {
  const team = createTeam(teamInput, { profileId: teamInput.profileId ?? "default" });
  const baseline = analyzeTeam(team).overallScore;
  const candidates = [];
  const projected = team.roster.filter((slot) => points(slot) !== null);
  for (const bench of projected.filter((slot) => slot.role === "BENCH")) {
    for (const starter of projected.filter((slot) => slot.role === "STARTER" && positionMatches(slot.player.position, bench.player.position))) {
      if (points(bench) <= points(starter)) continue;
      const roster = team.roster.map((slot) => slot.id === bench.id ? { ...slot, role: "STARTER" } : slot.id === starter.id ? { ...slot, role: "BENCH" } : slot);
      const score = analyzeTeam({ ...team, roster }).overallScore;
      candidates.push({ action: "START_PLAYER", playerAdded: null, playerStarted: bench.player, playerBenched: starter.player, playerRemoved: null, expectedScoreImprovement: round(Math.max(0, score - baseline)), reason: `${bench.player.name} projects for ${points(bench)} points versus ${starter.player.name} at ${points(starter)}.`, dataInputsUsed: ["projectedFantasyPoints", "rosterRole", "position"] });
    }
  }
  const available = availableInputs.map((input, index) => createAvailablePlayer(input, team.sport, index));
  for (const option of available.filter((item) => item.projection?.projectedFantasyPoints !== null)) {
    const replacement = projected.filter((slot) => positionMatches(slot.player.position, option.player.position)).sort((a, b) => points(a) - points(b))[0];
    if (!replacement || option.projection.projectedFantasyPoints <= points(replacement)) continue;
    const roster = team.roster.map((slot) => slot.id === replacement.id ? { ...slot, player: option.player, projection: option.projection } : slot);
    const score = analyzeTeam({ ...team, roster }).overallScore;
    candidates.push({ action: "ADD_PLAYER", playerAdded: option.player, playerStarted: replacement.role === "STARTER" ? option.player : null, playerBenched: null, playerRemoved: replacement.player, expectedScoreImprovement: round(Math.max(0, score - baseline)), reason: `${option.player.name} projects for ${option.projection.projectedFantasyPoints} points, ahead of ${replacement.player.name} at ${points(replacement)}.`, dataInputsUsed: ["availablePlayers", "projectedFantasyPoints", "position", "rosterRole"] });
  }
  return deepFreeze(candidates.filter((item) => item.expectedScoreImprovement > 0).sort((a, b) => b.expectedScoreImprovement - a.expectedScoreImprovement || a.reason.localeCompare(b.reason)).map((item, index) => ({ ...item, rank: index + 1, type: "IMPROVEMENT_RECOMMENDATION", recommendationVersion: TEAM_SCORE_VERSION })));
}

module.exports = { TEAM_SCORE_VERSION, analyzeTeam, recommendImprovements };
