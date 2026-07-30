const fs = require("fs/promises");
const path = require("path");

const LOGS_DIRECTORY = path.join(
  __dirname,
  "..",
  "logs"
);

const SNAPSHOTS_DIRECTORY = path.join(
  LOGS_DIRECTORY,
  "snapshots"
);

const LATEST_SNAPSHOT_FILE = path.join(
  LOGS_DIRECTORY,
  "latest-showtimes.json"
);

const DEFAULT_MAX_SNAPSHOTS = 100;

function createSnapshotFilename(snapshot) {
  const checkedAt =
    snapshot.checkedAt ??
    new Date().toISOString();

  const safeTimestamp = checkedAt
    .replace(/:/g, "-")
    .replace(/\./g, "-");

  const watchId = String(
    snapshot.watchId ?? "watch"
  )
    .replace(/[^a-zA-Z0-9_-]/g, "-");

  return `${safeTimestamp}-${watchId}.json`;
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), {
    recursive: true
  });

  const temporaryPath =
    `${filePath}.${process.pid}.tmp`;

  await fs.writeFile(
    temporaryPath,
    JSON.stringify(value, null, 2),
    "utf8"
  );

  await fs.rename(
    temporaryPath,
    filePath
  );
}

async function loadLatestSnapshot() {
  try {
    const data = await fs.readFile(
      LATEST_SNAPSHOT_FILE,
      "utf8"
    );

    return JSON.parse(data);
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function cleanupSnapshots({
  maxSnapshots = DEFAULT_MAX_SNAPSHOTS
} = {}) {
  await fs.mkdir(
    SNAPSHOTS_DIRECTORY,
    {
      recursive: true
    }
  );

  const entries = await fs.readdir(
    SNAPSHOTS_DIRECTORY,
    {
      withFileTypes: true
    }
  );

  const snapshotFiles = entries
    .filter((entry) => {
      return (
        entry.isFile() &&
        entry.name.endsWith(".json")
      );
    })
    .map((entry) => entry.name)
    .sort()
    .reverse();

  const filesToDelete =
    snapshotFiles.slice(maxSnapshots);

  await Promise.all(
    filesToDelete.map((filename) => {
      return fs.unlink(
        path.join(
          SNAPSHOTS_DIRECTORY,
          filename
        )
      );
    })
  );

  return {
    retained: Math.min(
      snapshotFiles.length,
      maxSnapshots
    ),
    deleted: filesToDelete.length
  };
}

async function saveSnapshot({
  watch,
  result,
  maxSnapshots = DEFAULT_MAX_SNAPSHOTS
}) {
  const savedAt = new Date().toISOString();

  const snapshot = {
    snapshotVersion: 1,
    savedAt,
    watchId: watch.id ?? null,
    provider: watch.provider ?? null,
    sourceUrl: watch.pageUrl ?? null,
    theater:
      result.theater ??
      watch.theater ??
      null,
    movie:
      result.movie ??
      watch.movie ??
      null,
    requestedFormat:
      watch.format ??
      null,
    extractedFormat:
      result.formatHeading ??
      result.format ??
      null,
    checkedAt:
      result.checkedAt ??
      savedAt,
    showtimeCount:
      result.showtimeCount ??
      result.showtimes?.length ??
      0,
    showtimes:
      result.showtimes ?? [],
    result
  };

  const filename =
    createSnapshotFilename(snapshot);

  const historicalPath = path.join(
    SNAPSHOTS_DIRECTORY,
    filename
  );

  await writeJson(
    historicalPath,
    snapshot
  );

  await writeJson(
    LATEST_SNAPSHOT_FILE,
    result
  );

  await cleanupSnapshots({
    maxSnapshots
  });

  return {
    snapshot,
    historicalPath,
    latestPath: LATEST_SNAPSHOT_FILE
  };
}

module.exports = {
  loadLatestSnapshot,
  saveSnapshot,
  cleanupSnapshots,
  LATEST_SNAPSHOT_FILE,
  SNAPSHOTS_DIRECTORY
};
