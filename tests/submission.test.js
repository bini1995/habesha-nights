const assert = require("node:assert/strict");
const test = require("node:test");
const { validateSubmission } = require("../src/domain/submission");

const valid = {
  event_name: "Ethiopian New Year DMV",
  description: "A community celebration with live music and food.",
  city_id: "00000000-0000-4000-8000-000000000102",
  category_id: "00000000-0000-4000-8000-000000000206",
  starts_at: "2026-09-12T18:00",
  ends_at: "2026-09-12T23:00",
  venue_name: "Community Hall",
  venue_address: "123 Main Street, Silver Spring, MD",
  organizer_name: "DMV Culture Table",
  contact_name: "Aster Example",
  contact_email: "aster@example.com",
  ticket_url: "https://tickets.example.com/new-year"
};

test("submission validation normalizes a complete organizer submission", () => {
  const result = validateSubmission(valid);
  assert.equal(result.title, valid.event_name);
  assert.equal(result.contact_email, "aster@example.com");
  assert.equal(result.starts_at, "2026-09-12T22:00:00.000Z");
});

test("submission validation rejects unsafe links and invalid dates", () => {
  assert.throws(() => validateSubmission({ ...valid, ticket_url: "javascript:alert(1)" }), /http or https/);
  assert.throws(() => validateSubmission({ ...valid, ends_at: "2026-09-12T17:00" }), /after the start/);
});
