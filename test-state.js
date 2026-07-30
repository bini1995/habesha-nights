const {
  getState,
  incrementStat,
  addEvent
} = require("./services/state");

incrementStat("totalChecks");

addEvent({
  type: "TEST_EVENT",
  title: "State system working"
});

console.dir(getState(), {
  depth: null
});
