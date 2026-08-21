const CALENDAR_TIMEZONE = "America/New_York";

function escapeCalendarText(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function formatUtc(value = new Date()) {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function formatNycLocal(value) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: CALENDAR_TIMEZONE,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hourCycle: "h23"
    }).formatToParts(new Date(value))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  return `${parts.year}${parts.month}${parts.day}T${parts.hour}${parts.minute}${parts.second}`;
}

function foldLine(line) {
  const folded = [];
  let current = "";
  let maxBytes = 75;
  for (const character of line) {
    if (Buffer.byteLength(current + character, "utf8") > maxBytes) {
      folded.push(current);
      current = ` ${character}`;
      maxBytes = 75;
    } else {
      current += character;
    }
  }
  folded.push(current);
  return folded.join("\r\n");
}

const TIMEZONE_COMPONENT = [
  "BEGIN:VTIMEZONE",
  `TZID:${CALENDAR_TIMEZONE}`,
  `X-LIC-LOCATION:${CALENDAR_TIMEZONE}`,
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:-0500",
  "TZOFFSETTO:-0400",
  "TZNAME:EDT",
  "DTSTART:19700308T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:-0400",
  "TZOFFSETTO:-0500",
  "TZNAME:EST",
  "DTSTART:19701101T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
  "END:STANDARD",
  "END:VTIMEZONE"
];

function eventLines(event, generatedAt) {
  const location = [event.venue?.name, event.venue?.address]
    .filter(Boolean).filter((value, index, values) => values.indexOf(value) === index)
    .join(", ");
  const uid = `${String(event.id).replace(/[^a-z0-9._-]/gi, "-")}@nyc-opportunity-agent.local`;
  const lines = [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${formatUtc(generatedAt)}`,
    `DTSTART;TZID=${CALENDAR_TIMEZONE}:${formatNycLocal(event.startsAt)}`
  ];
  if (event.endsAt) lines.push(`DTEND;TZID=${CALENDAR_TIMEZONE}:${formatNycLocal(event.endsAt)}`);
  lines.push(
    `SUMMARY:${escapeCalendarText(event.title)}`,
    `DESCRIPTION:${escapeCalendarText(event.description)}`,
    `LOCATION:${escapeCalendarText(location)}`,
    `URL:${event.url}`,
    "END:VEVENT"
  );
  return lines;
}

function createCalendar(events, { name = "NYC Event Finder Saved Events", generatedAt = new Date() } = {}) {
  if (!Array.isArray(events) || events.length === 0) {
    throw new Error("At least one saved event is required for calendar export.");
  }
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//NYC Opportunity Agent//Event Finder//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeCalendarText(name)}`,
    `X-WR-TIMEZONE:${CALENDAR_TIMEZONE}`,
    ...TIMEZONE_COMPONENT,
    ...events.flatMap((event) => eventLines(event, generatedAt)),
    "END:VCALENDAR"
  ];
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

module.exports = { CALENDAR_TIMEZONE, createCalendar, escapeCalendarText, foldLine, formatNycLocal };
