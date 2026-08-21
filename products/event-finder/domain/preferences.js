const { BOROUGHS, CATEGORIES } = require("./event");

const DEFAULT_PREFERENCES = Object.freeze({
  preferredBoroughs: Object.freeze([]),
  preferredCategories: Object.freeze([]),
  keywords: Object.freeze([]),
  hidePastEvents: true
});

function enumList(value, allowed, field) {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array.`);
  const normalized = [...new Set(value.map((item) => String(item).trim()
    .replace(/[ -]+/g, "_").toUpperCase()))];
  const invalid = normalized.find((item) => !allowed.includes(item));
  if (invalid) throw new Error(`${field} contains unsupported value "${invalid}".`);
  return normalized;
}

function normalizePreferences(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Preferences must be an object.");
  }

  const keywords = input.keywords ?? [];
  if (!Array.isArray(keywords)) throw new Error("keywords must be an array.");
  const normalizedKeywords = [...new Set(keywords.map((keyword) => String(keyword)
    .trim().toLowerCase()).filter(Boolean))];
  if (normalizedKeywords.length > 10) throw new Error("keywords may contain at most 10 values.");
  if (normalizedKeywords.some((keyword) => keyword.length > 40)) {
    throw new Error("Each keyword must be 40 characters or fewer.");
  }
  if (input.hidePastEvents !== undefined && typeof input.hidePastEvents !== "boolean") {
    throw new Error("hidePastEvents must be a boolean.");
  }

  return Object.freeze({
    preferredBoroughs: Object.freeze(enumList(
      input.preferredBoroughs ?? [], BOROUGHS, "preferredBoroughs"
    )),
    preferredCategories: Object.freeze(enumList(
      input.preferredCategories ?? [], CATEGORIES, "preferredCategories"
    )),
    keywords: Object.freeze(normalizedKeywords),
    hidePastEvents: input.hidePastEvents ?? true
  });
}

module.exports = { DEFAULT_PREFERENCES, normalizePreferences };
