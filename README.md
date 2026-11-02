# LeadFlow

Free-first B2B business discovery dashboard. Defaults: **Wealth → Financial advisors → United States**. Health and Relationships niches are also available.

## Run
Open `index.html` in a modern browser or serve it as a static site (for example with GitHub Pages). No build step, API key, or paid hosting is required.

## Live discovery
Enter a US city or state and click **Find businesses**. Nominatim geocodes the location and Overpass searches OpenStreetMap business listings. State-wide queries intentionally search a central area rather than exhausting public services. Nationwide is a target-market default, **not** a nationwide full-database scan. Results depend on OpenStreetMap coverage; the tool does not invent leads or contact details. Export CSV including public contact fields, filter and locally save lead identifiers. Published owner name, owner email (where explicitly tagged), company email, and LinkedIn/Facebook/Instagram/X/YouTube URLs are extracted from OpenStreetMap tags when available. Each lead has a contact-research search link for manual verification; this does not automatically scrape search engines, social profiles, or websites.

## Important limitations
- Some niche tag mappings are broad approximations; inspect results before outreach.
- Contact enrichment is limited to published OpenStreetMap tags. External search links are manual research aids, not verified automated crawling. Browser CORS, platform restrictions, and privacy laws prevent universal internet scraping.\n- This initial version does **not** send emails, schedule follow-ups, verify email addresses, or provide CRM persistence across devices.
- Free public Overpass/Nominatim instances have rate limits, availability limits and usage policies. For production scale, use a licensed business data provider and server-side caching.
- Scores represent listing completeness only, not conversion probability.
- Review CAN-SPAM, opt-out, provider policies and privacy requirements before enabling any future outreach.

## Next phase
Add backend storage, authenticated accounts, permitted lead providers, email OAuth/SMTP integration, unsubscribe and suppression handling, rate limits, reply detection and stop-on-reply follow-up scheduling. Never put email credentials in client-side code.

## Website enrichment (optional backend)
The dashboard includes **Enrich website contacts** and a field for a deployed HTTPS Worker URL. The backend is in `worker/src/index.js`, with configuration in `worker/wrangler.toml`.

1. Create a free Cloudflare account and install Wrangler (`npm install -g wrangler`).
2. From the `worker` directory, run `wrangler login` and `wrangler deploy`.
3. Paste the resulting HTTPS `workers.dev` URL into the dashboard and click **Enrich website contacts** after a lead search.
4. The dashboard checks up to 10 business websites per run. It does not automatically scrape social platforms or search engines.

**Deployment security:** This Worker is a prototype. It must not be made broadly available as a public API without authentication, per-user rate limiting, abuse monitoring, and stronger SSRF/network egress protection. It avoids obvious local/private addresses and redirects, checks robots.txt, and limits page sizes, but these are not sufficient for a hardened public crawler. It does not verify ownership of email addresses. Public website findings are temporary browser-session data and are included in CSV exports.
