# Free official company-register intelligence — NY & CO

LeadFlow now adds **on-demand legal-entity candidate lookup** from government-hosted open-data APIs. This is separate from website contact research and does not try to infer an owner email from a legal registration.

## Sources

| Official public source | Dataset | Data used | Do not infer |
|---|---|---|---|
| New York Department of State | https://data.ny.gov/d/n9v6-gdp6 | Exact legal entity name, DOS ID, entity type, county, published CEO-name field | CEO is the beneficial owner, CEO record is current, business website definitely belongs to the entity |
| Colorado Secretary of State | https://data.colorado.gov/d/4ykn-tg5h | Exact legal entity name, entity ID, entity status, type, principal city, registered agent name | Registered agent is owner, director or current employee |

Both datasets are hosted on official state open-data portals using Socrata SODA. Data can be stale, incomplete, vary by entity type, and names may not match a business trading name. NY's published snapshot includes active entities; Colorado's may include inactive or delinquent entities. No personal or service-of-process addresses are returned.

## How it works

- LeadFlow adds a **Check NY filing** or **Check CO filing** button on leads with a state identified from the source listing.
- The backend accepts a private, authenticated `POST /registry` request: `{"action":"lookup","name":"Example Company LLC","state":"NY"}`.
- The adapter queries only the fixed official open-data API host for that state; it uses a size- and time-limited, carefully escaped **exact legal-name match** (maximum five results), and records the dataset link.
- The result is marked `possible_legal_name_match`. It requires human confirmation that the legal entity corresponds to the lead, particularly when names are common.
- New York's public CEO name and Colorado's registered agent remain **different, clearly labeled roles**, and neither is automatically copied to the lead's `owner` or `ownerEmail` fields.
- Requests are rate paced, coalesced by exact query, and cached for six hours in process. No paid API keys, CAPTCHA bypass, identity checks, bulk downloads, or personal-address harvesting are added.
- For other states, prefer their official published bulk datasets or APIs after verifying their licenses and use terms. Do not imply that a source exists where it has not been checked.

## Verification

`node --test backend/test/official-registries.test.mjs`

The `LeadFlow tests` workflow checks frontend/backend regression. After merge, the existing verified GHCR image release still needs to be deployed to Render before the button works in the live app.

The open-registry result is *legal-entity candidate evidence*, not a definitive owner identity, current employment record, commercial lead-consent signal, or legal advice.
