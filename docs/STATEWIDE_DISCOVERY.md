# Statewide business discovery from published Geofabrik / OpenStreetMap extracts

LeadFlow now searches the complete published state listing snapshot when the location field is a **state name or two-letter state code**, such as `California`, `CA`, `Maryland, USA`, or `DC`. A city-with-state query such as `New York, NY` still invokes the existing local-city search rather than being treated as a statewide search.

## How it works

- Reuses the existing free source: Geofabrik-derived, ODbL-attributed OpenStreetMap business index files in `backend/data/us-regional/`. No paid lead provider, extra secrets, or cross-site scraping.
- Loads only the specified state's existing compressed index, using the existing bounded download, file validation, six-hour memory cache, and stale-source fallback. No need to use public Nominatim geocoding or Overpass for a state-only request.
- Selects records whose declared niche matches the request, retains only locations inside the state's published geographic polygon, filters out explicitly non-US records, and deduplicates by OSM type/id.
- Uses documented website, published business email, phone, address, and social links to **order listings within a city**, then rotates across cities so large metro areas do not crowd out smaller communities.
- Returns at most 250 listed businesses per request, with 20 on each LeadFlow UI page. Responses include `scope: statewide`, `totalMatched`, `cityCoverage`, and published snapshot date and staleness. These metrics describe *indexed records*, not all actual businesses.
- Does not invent names, addresses, emails, owner identity, sales figures, contact verification, or business classifications. The underlying source may be incomplete, outdated, or incorrectly tagged; review leads before contact.
- If the provider is unavailable and no older published records are stored, the result reports `provider_unavailable`, never a false claim that the state contains no businesses.

### Data license / attribution

OpenStreetMap contributors, ODbL 1.0; Geofabrik extracts. Preserve attribution and comply with ODbL obligations when redistributing, sharing, or exporting a substantial database. The existing frontend footer provides attribution.

## Verification

`node --test backend/test/statewide-discovery.test.mjs backend/test/regional-index.test.mjs`

The end-to-end `LeadFlow tests` workflow also validates application syntax, native UI, regional source coverage and backend HTTP behavior. A green GitHub test does **not** prove Render has deployed the new immutable container image. Verify deployed `GET /health` release SHA before claiming it is live.

The primary UI stays unchanged: type a state or ZIP in the existing location box and click **Find businesses**. Previously displayed leads remain excluded by the existing history settings.
