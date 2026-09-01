# Habesha Nights traction sprint

This is a two-week operating sprint, not a product-build phase. The objective is to prove that people discover events through Habesha Nights and that organizers value the traffic.

## Scoreboard

Track these numbers daily from `/admin/`. The dashboard now shows automatic progress for every product-measurable goal and generates attributed campaign links for each event.

| Goal | Target |
| --- | ---: |
| Published, rechecked upcoming events | 50 |
| Organizers contacted | 10 |
| Organizers who claim or submit | 5 |
| Unique visitors | 500 |
| Outbound ticket clicks | 100 |
| Free launch spotlight requests | 3 |

The dashboard cannot know whether an organizer was contacted before they interact. Keep the `10 organizers contacted` target in the outreach sheet, and use claims/submissions as the measurable activation result.

## Sprint starting point — September 1, 2026

- 27 upcoming events are live before the Phase 5 catalog migration
- 7 additional source-checked events are ready in the Phase 5 migration
- 34 upcoming listings will be live after the migration
- 16 more current listings are still needed to reach the target of 50
- Google Search Console ownership is verified, the sitemap is accepted, and the first event page is in the priority crawl queue

## Phase 6 catalog checkpoint — September 1, 2026

- 16 additional source-checked events are ready in the Phase 6 migration
- the batch is split evenly between NYC and the DMV
- the live upcoming catalog reaches 50 after the Phase 6 migration
- the first ten organizer prospects are prioritized in `docs/ORGANIZER_OUTREACH_PHASE6.csv`
- the New York African Restaurant Week Festival date is corrected to October 9–11 from its current ticket source

Do not fill the gap with weak or stale listings. Every addition needs a current organizer or ticket source, a confirmed date, a valid location, and a link that can be rechecked before it is promoted.

## Campaign links

Every social or organizer link should identify its source. Event links open the matching event directly and keep attribution through the ticket redirect.

```text
/?event=EVENT-SLUG&source=instagram
/?event=EVENT-SLUG&source=tiktok
/?event=EVENT-SLUG&source=whatsapp
/?event=EVENT-SLUG&source=organizer
```

Use `source=google` for search campaigns and omit the source for genuinely direct traffic. Never invent traffic by changing the source on the same click.

## Week 1 — catalog and outreach

1. Recheck every currently published event against its source and ticket page. Remove or update stale listings.
2. Add 20 more upcoming events, keeping the catalog limited to NYC and the DC/DMV.
3. Select ten organizers whose events have complete details and active ticket links.
4. Copy each organizer’s direct `source=organizer` event link from the event performance card in `/admin/` and send it with the listing note.
5. Publish three Instagram posts and one weekend roundup. Use the event-specific share link in every call to action.
6. Record replies, corrections, claims, new submissions, and follow-up dates in one simple outreach sheet.

Suggested organizer note:

> Hey — I’m building Habesha Nights, a discovery platform for Ethiopian and Eritrean-adjacent events in NYC and the DMV. I added your upcoming event and send visitors directly to your official ticket page. The listing is free. Here is the page: [EVENT LINK]. If you’d like to claim it, correct anything, or send future events, use “Claim this event” or “Submit an Event.”

## Week 2 — distribution and free spotlight test

1. Follow up once with organizers who opened or replied but did not claim.
2. Publish a Friday-to-Sunday roundup for each market and distribute it through Instagram and WhatsApp.
3. Identify the three events with the best view-to-ticket-click performance.
4. Send those organizers a short performance update with real numbers from `/admin/`.
5. Offer one free weekend spotlight to the strongest organizer prospects and measure whether priority placement improves views and ticket clicks.
6. End the sprint by recording which channel, city, category, and organizer action produced the strongest response.

Suggested performance follow-up:

> Quick update: Habesha Nights sent [TICKET CLICKS] visitors from your listing to the official ticket page, from [EVENT VIEWS] event views. I’m offering a free featured weekend spotlight during launch, with priority placement on the homepage and roundup. Would you like one for an upcoming event?

## When to turn payments on

Keep listings and spotlights free until the scoreboard shows at least 500 unique visitors, 100 outbound ticket clicks, five organizers claiming or submitting events, and three organizers requesting a spotlight. Then test one paid offer without building checkout:

1. Agree on the event, weekend, placement, and price by email or direct message.
2. Send a hosted Stripe Payment Link or a simple invoice for a $39 weekend feature.
3. Mark the request complete in `/admin/` after payment and delivery.
4. Send the organizer a results note with event views, ticket clicks, click-through rate, and traffic sources.

Only automate payment after at least three organizers have paid manually. The next revenue tests after featured events are promoted business listings, newsletter or roundup sponsorships, creator promotion packages, affiliate partnerships, and—once ticket volume is meaningful—ticket commissions.

## Decision after two weeks

- Continue if organizers claim or submit events, ticket clicks grow, and organizers request the free spotlight; begin a paid test only after the activation targets above are met.
- Improve distribution and listing quality if visitors click but organizers do not engage.
- Revisit the positioning before building more product if neither visitors nor organizers respond.

Do not start accounts, native apps, AI, integrated ticketing, social feeds, or automated payments during this sprint.
