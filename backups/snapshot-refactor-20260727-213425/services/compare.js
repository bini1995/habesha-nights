function compareShowtimes(previous, current) {
  const changes = [];

  const previousMap = new Map();
  const currentMap = new Map();

  for (const showtime of previous.showtimes ?? []) {
    previousMap.set(showtime.time, showtime);
  }

  for (const showtime of current.showtimes ?? []) {
    currentMap.set(showtime.time, showtime);
  }

  //
  // New showtimes + changed showtimes
  //
  for (const [time, currentShowtime] of currentMap) {
    const previousShowtime = previousMap.get(time);

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
  for (const [time, previousShowtime] of previousMap) {
    if (!currentMap.has(time)) {
      changes.push({
        type: "SHOWTIME_REMOVED",
        time,
        previous: previousShowtime
      });
    }
  }

  return changes;
}

module.exports = {
  compareShowtimes
};
