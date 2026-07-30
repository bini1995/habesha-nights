function getShowtime(change) {
  return change.current ?? change.previous ?? {
    time: change.time,
    status: change.newStatus ?? change.oldStatus,
    url: change.newUrl ?? change.oldUrl
  };
}

function normalizeStatus(status = "") {
  return String(status).trim().toLowerCase();
}

function isPurchasableStatus(status) {
  const normalized = normalizeStatus(status);

  return (
    normalized === "available" ||
    normalized === "almost full"
  );
}

function createEvents({
  watch,
  changes
}) {
  const events = [];

  for (const change of changes) {
    const showtime = getShowtime(change);

    if (change.type === "NEW_SHOWTIME") {
      events.push({
        id: `new-${showtime.datetime ?? showtime.time}`,
        type: "NEW_SHOWTIME",
        severity: "high",
        title: "New IMAX 70MM showtime released",
        message:
          `${watch.movie} has a new ${watch.format} showtime ` +
          `at ${showtime.time}.`,
        action: "VIEW_TICKETS",
        purchasable: isPurchasableStatus(
          showtime.status
        ),
        watch,
        showtime,
        originalChange: change
      });

      continue;
    }

    if (change.type === "STATUS_CHANGED") {
      const becamePurchasable =
        !isPurchasableStatus(change.oldStatus) &&
        isPurchasableStatus(change.newStatus);

      events.push({
        id:
          `status-${showtime.datetime ?? change.time}-` +
          `${change.newStatus}`,
        type: becamePurchasable
          ? "SEATS_AVAILABLE"
          : "AVAILABILITY_CHANGED",
        severity: becamePurchasable
          ? "critical"
          : "medium",
        title: becamePurchasable
          ? "Tickets may now be available"
          : "Showtime availability changed",
        message:
          `${change.time} changed from ` +
          `${change.oldStatus} to ${change.newStatus}.`,
        action: becamePurchasable
          ? "VIEW_TICKETS"
          : null,
        purchasable: isPurchasableStatus(
          change.newStatus
        ),
        watch,
        showtime: {
          ...showtime,
          status: change.newStatus
        },
        originalChange: change
      });

      continue;
    }

    if (change.type === "URL_CHANGED") {
      events.push({
        id: `url-${showtime.datetime ?? change.time}`,
        type: "PURCHASE_PAGE_CHANGED",
        severity: "medium",
        title: "Official purchase page changed",
        message:
          `The official ticket link changed for ` +
          `${change.time}.`,
        action: "VIEW_TICKETS",
        purchasable: isPurchasableStatus(
          showtime.status
        ),
        watch,
        showtime: {
          ...showtime,
          url: change.newUrl
        },
        originalChange: change
      });

      continue;
    }

    if (change.type === "SHOWTIME_REMOVED") {
      events.push({
        id: `removed-${showtime.datetime ?? change.time}`,
        type: "SHOWTIME_REMOVED",
        severity: "low",
        title: "Showtime removed",
        message:
          `${change.time} is no longer listed.`,
        action: null,
        purchasable: false,
        watch,
        showtime,
        originalChange: change
      });
    }
  }

  return events;
}

function getNotifiableEvents(events) {
  return events.filter((event) => {
    return (
      event.purchasable === true &&
      event.action === "VIEW_TICKETS"
    );
  });
}

module.exports = {
  createEvents,
  getNotifiableEvents,
  isPurchasableStatus
};
