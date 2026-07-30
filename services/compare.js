function compareShowtimes(previous, current) {
  const changes = [];

  const previousMap = new Map();
  const currentMap = new Map();

  for (const showtime of previous.showtimes ?? []) {
    const key =
      showtime.datetime ??
      showtime.time;

    previousMap.set(key, showtime);
  }

  for (const showtime of current.showtimes ?? []) {
    const key =
      showtime.datetime ??
      showtime.time;

    currentMap.set(key, showtime);
  }

  //
  // New showtimes + changed showtimes
  //
  for (const [key, currentShowtime] of currentMap) {
    const previousShowtime = previousMap.get(key);
    const time =
      currentShowtime.time ??
      previousShowtime?.time ??
      key;

    if (!previousShowtime) {
      changes.push({
        type: "NEW_SHOWTIME",
        time,
        current: currentShowtime
      });
      continue;
    }

    if (previousShowtime.status !== currentShowtime.status) {
      changes.push({
        type: "STATUS_CHANGED",
        time,
        oldStatus: previousShowtime.status,
        newStatus: currentShowtime.status
      });
    }

    if (previousShowtime.url !== currentShowtime.url) {
      changes.push({
        type: "URL_CHANGED",
        time,
        oldUrl: previousShowtime.url,
        newUrl: currentShowtime.url
      });
    }
  }

  //
  // Removed showtimes
  //
  for (const [key, previousShowtime] of previousMap) {
    if (!currentMap.has(key)) {
      changes.push({
        type: "SHOWTIME_REMOVED",
        time: previousShowtime.time ?? key,
        previous: previousShowtime
      });
    }
  }

  return changes;
}

module.exports = {
  compareShowtimes
};
