const SPORTS = Object.freeze([
  "FOOTBALL",
  "BASKETBALL"
]);

function normalizeSport(value) {
  const sport = String(value ?? "")
    .trim()
    .toUpperCase();

  if (!SPORTS.includes(sport)) {
    throw new Error(
      `sport must be one of: ${SPORTS.join(", ")}.`
    );
  }

  return sport;
}

module.exports = {
  SPORTS,
  normalizeSport
};
