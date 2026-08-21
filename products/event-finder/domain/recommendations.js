function recommendEvents({ events, preferences, savedEventIds = [], now = new Date(), limit = 20 }) {
  const saved = new Set(savedEventIds);
  const nowIso = now.toISOString();

  return events
    .filter((event) => !saved.has(event.id))
    .filter((event) => !preferences.hidePastEvents || (event.endsAt ?? event.startsAt) >= nowIso)
    .map((event) => {
      const reasons = [];
      let score = 0;

      if (preferences.preferredCategories.includes(event.category)) {
        score += 30;
        reasons.push(`Matches your ${event.category.toLowerCase().replaceAll("_", " ")} preference`);
      }
      if (preferences.preferredBoroughs.includes(event.venue.borough)) {
        score += 20;
        reasons.push(`In your preferred borough: ${event.venue.borough.toLowerCase().replaceAll("_", " ")}`);
      }
      const searchable = [event.title, event.description, event.venue.name, ...(event.tags ?? [])]
        .filter(Boolean).join(" ").toLowerCase();
      for (const keyword of preferences.keywords) {
        if (searchable.includes(keyword)) {
          score += 10;
          reasons.push(`Matches your keyword “${keyword}”`);
        }
      }

      if (reasons.length === 0) reasons.push("Upcoming soon in the NYC Parks calendar");
      return { event, score, reasons };
    })
    .sort((a, b) => b.score - a.score || a.event.startsAt.localeCompare(b.event.startsAt))
    .slice(0, limit);
}

module.exports = { recommendEvents };
