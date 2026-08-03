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

const LATEST_SNAPSHOTS_DIRECTORY = path.join(
  LOGS_DIRECTORY,
  "latest"
);

const LEGACY_LATEST_SNAPSHOT_FILE = path.join(
  LOGS_DIRECTORY,
  "latest-showtimes.json"
);

const DEFAULT_MAX_SNAPSHOTS = 100;

function getSafeWatchId(watchOrId) {
  const rawWatchId =
    typeof watchOrId === "string"
      ? watchOrId
      : watchOrId?.id;

  if (!rawWatchId) {
    throw new Error(
      "A watch id is required for snapshot storage."
    );
  }

  const safeWatchId = String(rawWatchId)
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (!safeWatchId) {
    throw new Error(
      `Watch id "${rawWatchId}" cannot be used as a filename.`
    );
  }

  return safeWatchId;
}

function getLatestSnapshotFile(watchOrId) {
  return path.join(
    LATEST_SNAPSHOTS_DIRECTORY,
    `${getSafeWatchId(watchOrId)}.json`
  );
}

function createSnapshotFilename(snapshot) {
  const checkedAt =
    snapshot.checkedAt ??
    new Date().toISOString();

  const safeTimestamp = checkedAt
    .replace(/:/g, "-")
    .replace(/\./g, "-");

  const safeWatchId = getSafeWatchId(
    snapshot.watchId
  );

  return `${safeTimestamp}-${safeWatchId}.json`;
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

async function loadLatestSnapshot(watchOrId) {
  const latestSnapshotFile =
    getLatestSnapshotFile(watchOrId);

  try {
    const data = await fs.readFile(
      latestSnapshotFile,
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
  maxSnapshots = DEFAULT_MAX_SNAPSHOTS,
  watchId = null
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

  const safeWatchId = watchId
    ? getSafeWatchId(watchId)
    : null;

  const snapshotFiles = entries
    .filter((entry) => {
      if (
        !entry.isFile() ||
        !entry.name.endsWith(".json")
      ) {
        return false;
      }

      if (!safeWatchId) {
        return true;
      }

      return entry.name.endsWith(
        `-${safeWatchId}.json`
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
  if (!watch?.id) {
    throw new Error(
      "A watch with an id is required to save a snapshot."
    );
  }

  const savedAt = new Date().toISOString();

  const snapshot = {
    snapshotVersion: 2,
    savedAt,
    watchId: watch.id,
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

  const latestPath =
    getLatestSnapshotFile(watch);

  await writeJson(
    historicalPath,
    snapshot
  );

  await writeJson(
    latestPath,
    result
  );

  await cleanupSnapshots({
    maxSnapshots,
    watchId: watch.id
  });

  return {
    snapshot,
    historicalPath,
    latestPath
  };
}

module.exports = {
  loadLatestSnapshot,
  saveSnapshot,
  cleanupSnapshots,
  getLatestSnapshotFile,
  LEGACY_LATEST_SNAPSHOT_FILE,
  LATEST_SNAPSHOTS_DIRECTORY,
  SNAPSHOTS_DIRECTORY
};
