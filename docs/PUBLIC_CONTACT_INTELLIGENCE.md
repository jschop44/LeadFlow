# LeadFlow public-source contact intelligence — free-first

LeadFlow builds contact evidence from sources that are free/open, explicitly public, and appropriate for a US business search. "Scrape every source" is not a safe or reliable strategy: some websites prohibit automated access, public service endpoints have rate limits, and scraped contacts can be stale or misattributed. Prefer official bulk datasets and provider APIs; use bounded, robots-permitted website inspection only for a given business.

## Sources already available

| Source | Data used | Access model | Confidence |
|---|---|---|---|
| OpenStreetMap + Geofabrik US extracts | Business name, location, niche tags, website, phone, contact tags | ODbL attributed published state snapshots | Community-contributed; review |
| Wikidata (SPARQL + MediaWiki API) | Official website claim, founder/CEO claims, country/business facts | Limited public API, cached lookups | Matched to official domain; can be stale |
| Business website (public HTML) | Contact/address pages, email links, phone links, social profile links, team and leadership names | Only valid public domain, robots.txt allowed, strict page-size/time/concurrency limits | **Observed publication**, not deliverability or verified current employment |
| Company JSON-LD (Schema.org) | Organization, founder/CEO/owner/person-published email, contactPoint, sameAs | Extracted from the same permitted company HTML | Explicit schema claim, not identity proof |
| Google PageSpeed / GrowthLens | Website performance and growth opportunities | Optional API and shared audited evidence | Website lab measurements, not lead conversion |
| HubSpot company sync | CRM destination, not a lead source | Optional authenticated manual handoff or CSV import | Depends on the supplied lead facts |

## Improvements in this release

- Start with the verified company homepage, inspect published links to Contact, About, Leadership, Team, Staff and similar pages, then use a bounded fallback list of common URLs.
- Extract explicitly published business email and telephone values, mailto/tel links, common human-readable obfuscation such as `hello [at] example [dot] com`, and Organization / LocalBusiness JSON-LD `email` and `contactPoint`.
- Match an explicitly named owner/founder and email **only if the company itself publishes them together in matching Organization structured data**. Do not guess addresses based on names or call a generic `info@` mailbox an owner's address.
- Keep per-address source pages, method, domain match, repeated sightings, and classification (`named_company_published`, `company_domain_published`, `external_domain_published`).
- Show clickable evidence sources in the UI and preserve provenance in CSV exports. CSV formula injection is mitigated.
- Continue the independent Wikidata founder/CEO cross-check as a different source of evidence; no attribution to a particular business email unless the direct company publication explicitly associates them.
- Return `sourceSummary` and `independentLeadershipSources` so clients can distinguish a verified lookup from a partial source failure.

## Consistent preferred-contact selection

The displayed company email, outreach recipient suggestion, lead-quality email score, and CSV `email` field now use the **same source-ranked selection**:

1. An explicitly published email from permitted company website pages, with the original source URL and available public DNS evidence. Company-published named contacts, company-domain addresses and corroborating pages are prioritized by the backend.
2. A legacy website-enriched address when newer per-email source evidence is unavailable.
3. An email attributed to the business in a public listing, marked **unverified** (including listings that call it an owner's email).

An email domain with observed `null_mx` or `domain_not_found` is **never automatically suggested**, including an alternate address at the same flagged domain in the listing. This does not prove other email domains or individual mailboxes are deliverable. An email whose public DNS lookup timed out remains **unknown**, not invalid.

The recipient input remains editable. Once the user explicitly edits that field, subsequent website enrichment does not overwrite it; clearing the field does not silently restore an unreviewed listing email at send time. Sending or opening the email composer still requires explicit user confirmation, and a manually entered address at a DNS-flagged domain triggers an additional warning in the existing confirmation text. No automated emailing is added.

CSV exports retain raw listing email and ownerEmail fields separately for provenance, plus the chosen email, `preferredEmailSource`, `preferredEmailRouting`, individual published-email sources and mail-domain evidence. Check the source before deciding whether contact is appropriate.

## Exclusions and protections

No personal/home addresses, private social content, paywall bypass, CAPTCHA bypass, password access, harvested unrelated third-party contacts, synthetic email pattern generation, SMTP mailbox probing, high-volume unsolicited outreach, or scraping platforms that prohibit it. A public email is not necessarily deliverable or permission to send marketing. Review sources and outreach regulations.

Respect OpenStreetMap attribution and ODbL terms and [Nominatim's public usage policy](https://operations.osmfoundation.org/policies/nominatim/): 1 request/second maximum, no exhaustive POI harvests. Use the published Geofabrik extracts for statewide/bulk discovery. Wikidata SPARQL is suitable for focused queries rather than global text-search dumps: https://www.wikidata.org/wiki/Wikidata:Data_access .

## Verify

`node --test backend/test/contact-evidence.test.mjs backend/test/research-execution.test.mjs backend/test/leadership.test.mjs`

Review `LeadFlow tests` and `Intelligence automation safety tests`, then confirm the new verified image SHA is deployed to Render before marking the feature live. GHCR publication and GitHub merges alone are not proof of production deployment.
