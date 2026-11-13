# Optional provider integrations (free-first)

LeadFlow keeps OpenStreetMap/Wikidata for discovery, Gmail OAuth for authorized outreach, and GrowthLens for audited recommendations. These integrations use specialized external services instead of replicating them in-house.

## Google PageSpeed Insights — per-lead website check

Use **Check website** in the lead row. The backend calls the Google PageSpeed Insights v5 API, which runs Lighthouse and returns mobile performance, accessibility, best-practices and SEO lab scores with a small number of improvement opportunities.

- No key is needed for limited use; optionally set `PAGESPEED_API_KEY` in the **leadflow-research-api** Render service for quota management. Do not place keys in frontend code.
- Access to `POST /website-audit` requires the existing `API_TOKEN` (header `X-LeadFlow-Token`) and valid public HTTPS website. The existing DNS/IP/network protections and per-client rate limit apply.
- Successful results are cached for six hours in memory. A provider outage or quota error is reported honestly rather than fabricated.
- The score is a Lighthouse **website laboratory score**, not the LeadFlow listing-completeness or sales-conversion score. It is a useful signal to inspect further in GrowthLens.
- Google receives the website URL as part of the assessment. The data is a public business website and the user starts each check manually.

## HubSpot CRM — explicit one-company handoff

HubSpot provides CRM record storage and management instead of LeadFlow building an entire second CRM. Use **Send to HubSpot** beside a lead. A confirmation appears before any data is transferred.

**No HubSpot API credential?** Choose **HubSpot import CSV** from Lead discovery → More discovery tools. LeadFlow exports website-linked companies with HubSpot-friendly property names and formula-injection-safe CSV cells; import it manually using HubSpot's built-in import wizard. This path does not require a Render secret or contact sync.

1. Create or use a supported HubSpot Project **Service Key** for system-to-system integration, or an existing authorized app token. New legacy private app creation was retired in autumn 2026; follow current HubSpot developer guidance. Make sure the credential can read and write *companies* (appropriate CRM companies scopes).
2. In Render, set `HUBSPOT_ACCESS_TOKEN` on the **leadflow-research-api** service. Never paste the token into GitHub, the browser dashboard, logs, or a URL.
3. Deploy an image built from verified LeadFlow `main` and confirm `GET /health` has `integrations.hubspot.configured: true`.
4. In the LeadFlow UI, enter the existing backend `API_TOKEN` under **Connection and search settings**. Select **Send to HubSpot** for one company and approve the handoff.

`POST /crm` with `{"action":"sync-company","company":{"name":"...","website":"https://...","phone":"..."}}` checks for existing companies by exact website domain. It creates a company when none exists, updates one matching company, and halts when the domain has multiple matches. No contacts, personal addresses, campaign lists, or emails are synchronized, and **no outreach is sent**. The browser never receives the HubSpot credential. Backend rate limiting applies.

HubSpot may impose account-level scopes and rate limits; an API credential is required for this optional feature. An unconfigured connector must report an error, not pretend to have saved a record. The existing LeadFlow lead library remains the default free storage.

## Verification and rollback

Run `node --test backend/test/provider-integrations.test.mjs` or the existing `LeadFlow tests` workflow. Confirm `GET /health` lists provider capability, and check the deployed revision before claiming live availability. If Google rate limits requests, omit `PAGESPEED_API_KEY` or stop requesting audits. For HubSpot, unset `HUBSPOT_ACCESS_TOKEN` to disable writes without changing the lead database or Gmail OAuth.

Reference documentation:
- https://developers.google.com/speed/docs/insights/v5/get-started
- https://developers.hubspot.com/developer-platform-basics
- https://developers.hubspot.com/changelog/legacy-private-app-creation-sunset
