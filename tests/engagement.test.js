const assert = require("node:assert/strict");
const test = require("node:test");
const { normalizeSource, validateClaim, validatePromotionRequest } = require("../src/domain/engagement");

test("traffic source uses explicit attribution then safe referrer inference", () => {
  assert.equal(normalizeSource("instagram"), "instagram");
  assert.equal(normalizeSource("", "https://www.google.com/search?q=habesha"), "google");
  assert.equal(normalizeSource("invented", ""), "direct");
});

test("claim and featured placement requests are normalized", () => {
  const claim = validateClaim({ contact_name: " Aster ", contact_email: "ASTER@example.com", relationship: "Promoter" });
  assert.equal(claim.contact_email, "aster@example.com");
  const promotion = validatePromotionRequest({ event_name: "New Year", organizer_name: "Culture Table", contact_email: "hello@example.com" });
  assert.equal(promotion.quoted_price_cents, 0);
  assert.equal(promotion.requested_placement, "weekend_featured");
});
