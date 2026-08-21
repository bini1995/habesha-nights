const crypto = require("crypto");
const { createAvailablePlayer, createTeam, deepFreeze } = require("./models");
const { normalizeSport } = require("./sports");

const IMPORT_SCHEMA_VERSION = "sports-hub-import/1.0";
const SOURCE_TYPES = Object.freeze(["CSV", "JSON", "OFFLINE_SAMPLE"]);

function text(value, field, required = true) {
  const normalized = String(value ?? "").trim();
  if (required && !normalized) throw new Error(`${field} is required.`);
  return normalized || null;
}
function identifier(value, field) {
  const normalized = text(value, field).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "");
  if (!normalized) throw new Error(`${field} must contain letters or numbers.`);
  return normalized;
}
function numeric(value, field, minimum = 0, maximum = 1000, optional = true) {
  if ((value === "" || value === null || value === undefined) && optional) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) throw new Error(`${field} must be between ${minimum} and ${maximum}.`);
  return number;
}
function checksum(content) { return crypto.createHash("sha256").update(String(content)).digest("hex"); }

function parseCsv(content) {
  const rows = []; let row = []; let value = ""; let quoted = false;
  const input = String(content).replace(/^\uFEFF/, "");
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character === '"') {
      if (quoted && input[index + 1] === '"') { value += '"'; index += 1; } else quoted = !quoted;
    } else if (character === "," && !quoted) { row.push(value); value = ""; }
    else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && input[index + 1] === "\n") index += 1;
      row.push(value); value = ""; if (row.some((cell) => cell.trim())) rows.push(row); row = [];
    } else value += character;
  }
  if (quoted) throw new Error("CSV contains an unclosed quoted field.");
  row.push(value); if (row.some((cell) => cell.trim())) rows.push(row);
  if (rows.length < 2) throw new Error("CSV requires a header and at least one data row.");
  const headers = rows.shift().map((header) => header.trim().toLowerCase());
  if (new Set(headers).size !== headers.length) throw new Error("CSV headers must be unique.");
  return rows.map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index]?.trim() ?? ""])));
}

function csvToImport(content, requestedSport) {
  const rows = parseCsv(content); const first = rows[0]; const sport = normalizeSport(requestedSport ?? first.sport);
  const requiredHeaders = ["record_type", "player_id", "player_name", "position", "projected_points"];
  for (const header of requiredHeaders) if (!(header in first)) throw new Error(`CSV header ${header} is required.`);
  const starterPositions = text(first.starter_positions, "starter_positions").split(/[|;]/).map((item) => item.trim()).filter(Boolean);
  const base = {
    schemaVersion: IMPORT_SCHEMA_VERSION, sport, season: text(first.season, "season"), scoringPeriod: text(first.scoring_period, "scoring_period"),
    projectionDate: text(first.projection_date, "projection_date"),
    team: { id: identifier(first.team_id, "team_id"), name: text(first.team_name, "team_name"), manager: { id: identifier(first.manager_id, "manager_id"), name: text(first.manager_name, "manager_name") } },
    league: { name: text(first.league_name, "league_name"), starterPositions, scoringRules: first.scoring_rules ? JSON.parse(first.scoring_rules) : {} }, roster: [], availablePlayers: []
  };
  rows.forEach((item, index) => {
    const player = { id: identifier(item.player_id, `rows[${index}].player_id`), name: text(item.player_name, `rows[${index}].player_name`), sport, position: text(item.position, `rows[${index}].position`).toUpperCase(), status: text(item.status, "status", false) ?? "UNKNOWN" };
    const projection = { playerId: player.id, projectedFantasyPoints: numeric(item.projected_points, "projected_points"), availability: numeric(item.availability, "availability", 0, 1), source: "USER_CSV" };
    const type = text(item.record_type, "record_type").toUpperCase();
    if (type === "ROSTER") base.roster.push({ id: identifier(item.slot_id || `slot-${index + 1}`, "slot_id"), role: text(item.role, "role").toUpperCase(), player, projection });
    else if (type === "AVAILABLE") base.availablePlayers.push({ player, projection });
    else throw new Error(`rows[${index}].record_type must be ROSTER or AVAILABLE.`);
  });
  return { data: base, rowCount: rows.length };
}

function jsonToImport(content, requestedSport) {
  let data;
  try { data = typeof content === "string" ? JSON.parse(content) : content; } catch (error) { throw new Error(`Invalid JSON: ${error.message}`); }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("JSON import must be an object.");
  return { data: { ...data, sport: normalizeSport(requestedSport ?? data.sport) }, rowCount: (data.roster?.length ?? 0) + (data.availablePlayers?.length ?? 0) };
}

function normalizeImport(data) {
  if (data.schemaVersion !== IMPORT_SCHEMA_VERSION) throw new Error(`schemaVersion must be ${IMPORT_SCHEMA_VERSION}.`);
  const sport = normalizeSport(data.sport);
  const manager = { id: identifier(data.team?.manager?.id, "team.manager.id"), name: text(data.team?.manager?.name, "team.manager.name") };
  const team = createTeam({ id: identifier(data.team?.id, "team.id"), name: text(data.team?.name, "team.name"), sport, leagueSettings: { sport, name: text(data.league?.name, "league.name"), starterPositions: data.league?.starterPositions, scoringLabel: "Imported projected fantasy points", scoringRules: data.league?.scoringRules ?? {} }, roster: data.roster }, { profileId: "default" });
  const availablePlayers = (data.availablePlayers ?? []).map((item, index) => createAvailablePlayer(item, sport, index));
  const rosterIds = new Set(team.roster.map((slot) => slot.player.id)); const availableIds = new Set(); const conflicts = [];
  for (const item of availablePlayers) {
    if (rosterIds.has(item.player.id)) conflicts.push(`${item.player.name} appears on both the roster and waiver pool.`);
    if (availableIds.has(item.player.id)) conflicts.push(`${item.player.name} appears more than once in the waiver pool.`);
    availableIds.add(item.player.id);
  }
  if (conflicts.length) throw new Error(conflicts.join(" "));
  const warnings = [];
  const missing = team.roster.filter((slot) => slot.projection?.projectedFantasyPoints == null).length;
  if (missing) warnings.push(`${missing} roster player${missing === 1 ? " is" : "s are"} missing a projection.`);
  if (!availablePlayers.length) warnings.push("No available-player pool was supplied.");
  const projectionDate = text(data.projectionDate, "projectionDate");
  if (!/^\d{4}-\d{2}-\d{2}/.test(projectionDate) || Number.isNaN(Date.parse(projectionDate))) throw new Error("projectionDate must be a valid ISO date.");
  return deepFreeze({ schemaVersion: IMPORT_SCHEMA_VERSION, sport, season: text(data.season, "season"), scoringPeriod: text(data.scoringPeriod, "scoringPeriod"), projectionDate, manager, scoringRules: data.league?.scoringRules ?? {}, team, availablePlayers, warnings });
}

function parseImport({ sourceType, content, sport }) {
  const source = String(sourceType ?? "").toUpperCase(); if (!SOURCE_TYPES.includes(source)) throw new Error(`sourceType must be one of: ${SOURCE_TYPES.join(", ")}.`);
  const parsed = source === "CSV" ? csvToImport(content, sport) : jsonToImport(content, sport);
  return { normalized: normalizeImport(parsed.data), rowCount: parsed.rowCount, checksum: checksum(typeof content === "string" ? content : JSON.stringify(content)), sourceType: source };
}

module.exports = { IMPORT_SCHEMA_VERSION, SOURCE_TYPES, checksum, normalizeImport, parseCsv, parseImport };
