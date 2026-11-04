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

## Secure Worker configuration
Set `API_TOKEN` as a Cloudflare Worker secret using `wrangler secret put API_TOKEN` (use a strong randomly generated value). Set `ALLOWED_ORIGIN` as a Worker environment variable matching the exact HTTPS origin of your GitHub Pages site (for example `https://jschop44.github.io`). The browser dashboard has a session-only API token field; enter the secret when using enrichment. **Do not commit this token to GitHub or expose the Worker publicly without authentication.**

The current Worker token check is an initial access gate, **not production-grade security**. Add per-client quotas, logging, rate limiting, request timeouts, response-size enforcement during streaming, and stricter DNS/IP egress protections before production deployment. Restrict use to websites that permit automated access. The Worker does not scrape social media profiles or establish ownership of an email address.

## Live Render deployment (November 2026)
Frontend: https://leadflow-tp57.onrender.com
Research backend: https://leadflow-research-api.onrender.com
Backend health: https://leadflow-research-api.onrender.com/health
The frontend defaults to the backend `/enrich` endpoint. The backend requires the private `API_TOKEN` configured in Render; enter it into the frontend session-only token field. Never put the token into committed frontend code. The backend runs on Render's free web service plan; availability and limits are subject to Render.

The backend crawls only a few common pages of public company websites and checks robots.txt, applies request timeouts, limits response sizes, blocks obvious private network destinations and enforces a basic request rate limit. This is **not** a general-purpose internet scraper, neural network, or independently verified contact database. Public contact details can be stale or inaccurate. Social profiles are discovered only when linked by the business website; the service does not scrape social networks.

## Outreach studio
Use **Draft outreach** on a lead, then fill in your offer, sender identification, and opt-out instructions. LeadFlow creates an editable first email and two proposed follow-ups. **No emails or social messages are sent.** Automatic sending requires sender authorization, durable campaign and suppression storage, reply detection, opt-out processing, verified sender domains and careful compliance controls. No service can guarantee spam-folder avoidance.

## Intelligence automation reliability (opt-in)
- The intelligence cycle requires `KNOWLEDGE_BASE_ENABLED=true`, `INTELLIGENCE_AUTOMATION_ENABLED=true`, and a working `DATABASE_URL` on the Render backend. `INTELLIGENCE_AUTO_AUDIT_ENABLED=true` separately enables one bounded Growth Lens audit per cycle.
- A session-scoped Postgres advisory lock prevents two backend instances or overlapping wake-ups from running the same cycle concurrently. Prospect records and suggested tasks use unique database constraints and remain review-only; no outreach is automatically sent.
- The built-in 15-minute timer runs only while the Render process is awake. The GitHub Actions `intelligence-schedule.yml` workflow provides an additional free-tier wake-up trigger after merging to the default branch. GitHub scheduled jobs are best-effort, can be delayed or disabled, and are **not** guaranteed exact 15-minute execution.
- **Manual owner step:** create the GitHub Actions repository secret `LEADFLOW_AUTOMATION_TOKEN` with the same value as the backend's existing Render `API_TOKEN`. Do not put the secret in source control, chat messages, or frontend JavaScript. Until this secret exists, scheduled jobs intentionally skip the request.
- **Manual owner step:** confirm the backend feature flags and database access in Render. No paid Render service, disk, or cron job is required by this workflow. Existing free-tier usage limits still apply.
- The endpoint `POST /automation` with `{"action":"run"}` requires the private `X-LeadFlow-Token` header. The workflow invokes it over HTTPS. Failed wake-ups do not send email, and the next successful cycle can retry pending work.
- Verify the GitHub Actions **Intelligence automation safety tests** workflow, then inspect **Wake LeadFlow intelligence cycle** runs and the backend automation status before describing the system as fully operational. Do not treat a green skip as proof of an actual cycle.
- Rollback: disable `INTELLIGENCE_AUTOMATION_ENABLED` in Render and/or disable the GitHub schedule workflow. Existing candidate and suggestion data is preserved; removal of the optional tables is a separate, deliberate database operation after backup.
