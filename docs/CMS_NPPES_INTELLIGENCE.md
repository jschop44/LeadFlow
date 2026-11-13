# Free CMS NPPES Healthcare Business Intelligence

LeadFlow integrates the **U.S. Centers for Medicare & Medicaid Services** NPPES NPI Registry, a free federal public directory, to enrich business leads in the supported healthcare niches: dental practices, chiropractors, nutritionists, wellness clinics and med spas.

**Source:** https://npiregistry.cms.hhs.gov/registry/help-api

## What it does

The healthcare lead contact panel offers **Check federal NPI directory**. This requires the existing private LeadFlow backend token and performs a user-initiated, scoped query for the displayed business name, US state and city when known.

It queries the official `https://npiregistry.cms.hhs.gov/api/?version=2.1` API with `enumeration_type=NPI-2` and at most 20 results. Only organization records (Type 2) with exactly matching normalized organization names and public matching practice locations are returned. It does not search Type 1 individual provider records.

For a possible match, it displays:

- Published legal organization name and unique NPI number.
- Public practice-location telephone number, city and state.
- Organization specialty/taxonomy descriptions.
- The name and position of the record's authorized official, if publicly included. **This is not necessarily the business owner**.
- A direct link to the official CMS query for the NPI and the registry check date.

The NPI match is not silently copied into owner/email fields. A matching name does not independently prove the listed website, location or organization are the same business, and it is not a credentialing, licensing or employment-status check.

## Safe and efficient use of free public data

CMS warns that NPI Registry query frequency is limited per hour. LeadFlow limits these calls to manual research rather than automatic nationwide harvesting. Its shared provider pacer serializes queries to at least two seconds apart, coalesces duplicates, caches successful lookups for 12 hours, and bounds response sizes, timeouts and results. It uses **no new API key or paid service**.

The NPPES API reports public provider records. This integration intentionally omits full mailing addresses, individual Type 1 clinician records, personal emails and unnecessary personal identifiers. It uses only the published business facts for lead research. Do not treat NPPES data as evidence of marketing permission or verified email deliverability.

For bulk NPI analysis, CMS recommends the downloadable monthly or weekly public data files instead of querying the public API in loops:

- https://www.cms.gov/medicare/regulations-guidance/administrative-simplification/data-dissemination
- https://download.cms.gov/nppes/NPI_Files.html

## Verification / release

Run `node --test backend/test/nppes.test.mjs`, plus the existing full GitHub `LeadFlow tests` workflow. Ensure the API response is source-attributed and never includes individual-provider details.

These changes require publishing a verified GHCR container and deploying it to Render. The existing Render Research API remained pinned to an older November 10 image at the time this implementation began; green GitHub CI alone is **not** production deployment.
