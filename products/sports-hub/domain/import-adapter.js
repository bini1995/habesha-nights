const { parseImport } = require("./import-schema");

class TeamImportAdapter {
  constructor(id, sourceType = null) { this.id = id; this.sourceType = sourceType; }
  async importTeam() { throw new Error(`${this.id} import is not implemented.`); }
}

class JsonTeamImportAdapter extends TeamImportAdapter {
  constructor() { super("json", "JSON"); }
  async importTeam({ content, sport }) { return parseImport({ sourceType: this.sourceType, content, sport }); }
}

class CsvTeamImportAdapter extends TeamImportAdapter {
  constructor() { super("csv", "CSV"); }
  async importTeam({ content, sport }) { return parseImport({ sourceType: this.sourceType, content, sport }); }
}

class OfflineSampleImportAdapter extends TeamImportAdapter {
  constructor() { super("offline-sample", "OFFLINE_SAMPLE"); }
  async importTeam({ content, sport }) { return parseImport({ sourceType: this.sourceType, content, sport }); }
}

module.exports = { CsvTeamImportAdapter, JsonTeamImportAdapter, OfflineSampleImportAdapter, TeamImportAdapter };
