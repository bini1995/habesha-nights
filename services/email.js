const { Resend } = require("resend");

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(datetime) {
  if (!datetime) {
    return "Date unavailable";
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(new Date(datetime));
}

function renderEvent(event) {
  const showtime = event.showtime ?? {};
  const purchaseUrl = showtime.url ?? "#";

  return `
    <div style="
      border:1px solid #dddddd;
      border-radius:12px;
      padding:20px;
      margin:16px 0;
      background:#ffffff;
    ">
      <div style="
        font-size:13px;
        font-weight:700;
        text-transform:uppercase;
      ">
        ${escapeHtml(event.severity)}
      </div>

      <h2 style="margin:8px 0;">
        ${escapeHtml(event.title)}
      </h2>

      <div style="font-size:22px;font-weight:700;">
        ${escapeHtml(showtime.time ?? "Unknown time")}
      </div>

      <div style="margin-top:6px;color:#444444;">
        ${escapeHtml(formatDate(showtime.datetime))}
      </div>

      <p>${escapeHtml(event.message)}</p>

      <div>
        Availability:
        <strong>
          ${escapeHtml(showtime.status ?? "Unknown")}
        </strong>
      </div>

      <div style="margin-top:20px;">
        <a
          href="${escapeHtml(purchaseUrl)}"
          style="
            display:inline-block;
            padding:13px 20px;
            border-radius:8px;
            background:#111111;
            color:#ffffff;
            text-decoration:none;
            font-weight:700;
          "
        >
          View Official Tickets
        </a>
      </div>

      <div style="
        margin-top:14px;
        font-size:12px;
        color:#777777;
      ">
        This alert does not purchase tickets.
      </div>
    </div>
  `;
}

async function sendEventEmail({
  watch,
  current,
  events
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.ALERT_EMAIL_TO;
  const from = process.env.ALERT_EMAIL_FROM;

  if (!apiKey || !to || !from) {
    throw new Error(
      "Missing RESEND_API_KEY, ALERT_EMAIL_TO, or " +
      "ALERT_EMAIL_FROM in .env"
    );
  }

  const resend = new Resend(apiKey);

  const html = `
    <!doctype html>
    <html>
      <body style="
        margin:0;
        padding:24px;
        background:#f5f5f5;
        font-family:Arial,sans-serif;
        color:#111111;
      ">
        <div style="
          max-width:640px;
          margin:0 auto;
          background:#ffffff;
          border-radius:14px;
          padding:26px;
        ">
          <div style="
            font-size:13px;
            letter-spacing:1px;
            text-transform:uppercase;
            color:#666666;
          ">
            NYC Opportunity Agent
          </div>

          <h1 style="margin-bottom:4px;">
            ${escapeHtml(watch.movie)}
          </h1>

          <div>${escapeHtml(watch.theater)}</div>

          <div style="margin-top:4px;font-weight:700;">
            ${escapeHtml(watch.format)}
          </div>

          <p style="margin-top:20px;">
            ${events.length} purchasable ticket alert${
              events.length === 1 ? "" : "s"
            } detected.
          </p>

          ${events.map(renderEvent).join("")}

          <div style="
            margin-top:24px;
            font-size:12px;
            color:#777777;
          ">
            Checked at
            ${escapeHtml(formatDate(current.checkedAt))}
          </div>
        </div>
      </body>
    </html>
  `;

  const { data, error } = await resend.emails.send({
    from,
    to: [to],
    subject:
      `Tickets available: ${watch.movie} — ` +
      `${watch.format}`,
    html
  });

  if (error) {
    throw new Error(
      `Resend failed: ${JSON.stringify(error)}`
    );
  }

  return data;
}

module.exports = {
  sendEventEmail
};
