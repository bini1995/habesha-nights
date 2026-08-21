const {
  POSITIONS,
  deepFreeze
} = require("./models");

const {
  normalizeSport
} = require("./sports");

const PLAYER_IDENTITY_SCHEMA_VERSION = "sports-hub-player-identity/1.0";
const MATCH_STATUSES = Object.freeze([
  "MATCHED",
  "AMBIGUOUS",
  "UNMATCHED"
]);
const MATCH_METHODS = Object.freeze([
  "EXACT_NAME",
  "ALIAS",
  "FUZZY"
]);

function text(value, field, maximum = 120) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${field} is required.`);
  }

  const normalized = value.trim();
  if (normalized.length > maximum) {
    throw new Error(`${field} must be ${maximum} characters or fewer.`);
  }
  return normalized;
}

function identifier(value, field) {
  const normalized = text(value, field, 160);
  if (!/^[a-zA-Z0-9._:-]+$/.test(normalized)) {
    throw new Error(
      `${field} may contain only letters, numbers, dots, colons, hyphens, and underscores.`
    );
  }
  return normalized;
}

function normalizePlayerName(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-US")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+(jr|sr|ii|iii|iv)$/i, "")
    .replace(/\s+/g, " ");
}

function bigrams(value) {
  const compact = value.replace(/\s+/g, "");
  if (compact.length < 2) return compact ? [compact] : [];
  const result = [];
  for (let index = 0; index < compact.length - 1; index += 1) {
    result.push(compact.slice(index, index + 2));
  }
  return result;
}

function diceSimilarity(left, right) {
  if (left === right && left !== "") return 1;
  const leftPairs = bigrams(left);
  const rightPairs = bigrams(right);
  if (!leftPairs.length || !rightPairs.length) return 0;

  const remaining = [...rightPairs];
  let overlap = 0;
  for (const pair of leftPairs) {
    const match = remaining.indexOf(pair);
    if (match < 0) continue;
    overlap += 1;
    remaining.splice(match, 1);
  }
  return (2 * overlap) / (leftPairs.length + rightPairs.length);
}

function normalizePosition(value, sport, field) {
  const position = String(value ?? "UNKNOWN").trim().toUpperCase();
  if (position === "UNKNOWN" || position === "") return "UNKNOWN";
  if (!POSITIONS[sport].includes(position)) {
    throw new Error(`${field} is not supported for ${sport}.`);
  }
  return position;
}

function createDirectoryPlayer(input, expectedSport, index = 0) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error(`players[${index}] must be an object.`);
  }
  const sport = normalizeSport(input.sport ?? expectedSport);
  if (expectedSport && sport !== expectedSport) {
    throw new Error(`players[${index}].sport must be ${expectedSport}.`);
  }
  const aliases = Array.isArray(input.aliases)
    ? input.aliases
      .map((alias, aliasIndex) => text(alias, `players[${index}].aliases[${aliasIndex}]`))
      .slice(0, 20)
    : [];

  return deepFreeze({
    aliases,
    id: identifier(input.id, `players[${index}].id`),
    name: text(input.name, `players[${index}].name`),
    position: normalizePosition(input.position, sport, `players[${index}].position`),
    providerPlayerId: identifier(
      input.providerPlayerId ?? input.id,
      `players[${index}].providerPlayerId`
    ),
    sport,
    teamLabel: input.teamLabel
      ? text(input.teamLabel, `players[${index}].teamLabel`, 80)
      : null
  });
}

function compareCandidate(query, requestedPosition, player) {
  const canonical = normalizePlayerName(player.name);
  const aliases = player.aliases.map(normalizePlayerName);
  let method = "FUZZY";
  let score = diceSimilarity(query, canonical);

  if (query === canonical) {
    method = "EXACT_NAME";
    score = 1;
  } else if (aliases.includes(query)) {
    method = "ALIAS";
    score = 0.99;
  } else {
    score = Math.max(score, ...aliases.map((alias) => diceSimilarity(query, alias)));
  }

  if (requestedPosition !== "UNKNOWN") {
    score += requestedPosition === player.position ? 0.04 : -0.16;
  }

  return {
    method,
    player,
    score: Math.max(0, Math.min(1, Math.round(score * 1000) / 1000))
  };
}

function publicCandidate(candidate, provider) {
  return deepFreeze({
    confidence: candidate.score,
    id: candidate.player.id,
    matchMethod: candidate.method,
    name: candidate.player.name,
    position: candidate.player.position,
    providerId: provider.id,
    providerPlayerId: candidate.player.providerPlayerId,
    sport: candidate.player.sport,
    teamLabel: candidate.player.teamLabel
  });
}

function resolvePlayerIdentity(input, directory, provider, inputIndex = 0) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error(`players[${inputIndex}] must be an object.`);
  }
  const sport = normalizeSport(input.sport);
  const name = text(input.name, `players[${inputIndex}].name`);
  const position = normalizePosition(
    input.position,
    sport,
    `players[${inputIndex}].position`
  );
  const query = normalizePlayerName(name);
  const ranked = directory
    .map((player, index) => createDirectoryPlayer(player, sport, index))
    .map((player) => compareCandidate(query, position, player))
    .filter((candidate) => candidate.score >= 0.5)
    .sort((left, right) =>
      right.score - left.score || left.player.name.localeCompare(right.player.name) ||
      left.player.id.localeCompare(right.player.id)
    )
    .slice(0, 5);
  const exactCandidates = ranked.filter((candidate) =>
    ["EXACT_NAME", "ALIAS"].includes(candidate.method) &&
    (position === "UNKNOWN" || candidate.player.position === position)
  );
  const matched = exactCandidates.length === 1 ? exactCandidates[0] : null;
  const status = matched
    ? "MATCHED"
    : ranked.length
      ? "AMBIGUOUS"
      : "UNMATCHED";

  return deepFreeze({
    candidates: ranked.map((candidate) => publicCandidate(candidate, provider)),
    input: {
      name,
      position,
      sport
    },
    inputIndex,
    selectedPlayerId: matched?.player.id ?? null,
    status
  });
}

module.exports = {
  MATCH_METHODS,
  MATCH_STATUSES,
  PLAYER_IDENTITY_SCHEMA_VERSION,
  createDirectoryPlayer,
  diceSimilarity,
  normalizePlayerName,
  resolvePlayerIdentity
};
