class TeamImportAdapter {
  constructor(id) { this.id = id; }
  async importTeam() { throw new Error(`${this.id} import is not implemented.`); }
}

class JsonTeamImportAdapter extends TeamImportAdapter {
  constructor() { super("json"); }
  async importTeam(input) { return input; }
}

module.exports = { JsonTeamImportAdapter, TeamImportAdapter };
