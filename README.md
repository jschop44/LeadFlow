# LeadFlow

Free-first B2B business discovery dashboard. Defaults: **Wealth → Financial advisors → United States**. Health and Relationships niches are also available.

## Run
Open `index.html` in a modern browser or serve it as a static site (for example with GitHub Pages). No build step, API key, or paid hosting is required.

## Live discovery
Enter a US city or state and click **Find businesses**. Nominatim geocodes the location and Overpass searches OpenStreetMap business listings. State-wide queries intentionally search a central area rather than exhausting public services. Nationwide is a target-market default, **not** a nationwide full-database scan. Results depend on OpenStreetMap coverage; the tool does not invent leads or contact details. Export CSV, filter and locally save lead identifiers.

## Important limitations
- Some niche tag mappings are broad approximations; inspect results before outreach.
- This initial version does **not** send emails, schedule follow-ups, verify email addresses, or provide CRM persistence across devices.
- Free public Overpass/Nominatim instances have rate limits, availability limits and usage policies. For production scale, use a licensed business data provider and server-side caching.
- Scores represent listing completeness only, not conversion probability.
- Review CAN-SPAM, opt-out, provider policies and privacy requirements before enabling any future outreach.

## Next phase
Add backend storage, authenticated accounts, permitted lead providers, email OAuth/SMTP integration, unsubscribe and suppression handling, rate limits, reply detection and stop-on-reply follow-up scheduling. Never put email credentials in client-side code.
