# Wikidata ownership signals and cross-source leadership evidence

LeadFlow has always cross-referenced Wikidata founders (P112) and CEOs (P169) after matching the company's official website (P856). This upgrade also checks publicly recorded **owned by (P127)** statements.

Owner claims are accepted only when:

- The company entry explicitly lists the same official domain as the business being researched, not a similar-looking domain.
- The proposed owner is a Wikidata human entity (instance of human, P31 = Q5).
- The Wikidata ownership statement is not deprecated and does not have a recorded end-time qualifier.
- A recognizable person name and a Wikidata entity reference exist. A CEO, founder, shareholder or registered agent is never automatically treated as the beneficial owner.

The public Wikidata data might be outdated or incomplete, so the UI calls these **reported owners** and links back to the Wikidata entity. No personal residence, date of birth, or unrelated personal data is collected, and LeadFlow does not invent an email from a leader's name.

The leadership reconciliation engine retains up to three source links for a name/role match, distinguishing public claims from the company's own site versus Wikidata. When both sources agree on name and role, it reports *cross-source agreement*, not a verified identity, current position or ownership percentage. This improves ranking and research transparency without adding new API keys.

Wikidata usage follows the same bounded query, 14-second research deadline, 4 concurrent lookups maximum, positive-cache TTL and temporary provider-outage cooldown already implemented. Heavy, systematic queries against public Wikidata SPARQL are not appropriate; use licensed dumps or a privately hosted endpoint for bulk research.

Docs: https://www.wikidata.org/wiki/Property:P127 and https://www.wikidata.org/wiki/Wikidata:Data_access

Tests: `node --test backend/test/wikidata-leadership.test.mjs backend/test/leadership-reconciliation.test.mjs backend/test/research-execution.test.mjs`

New code in GitHub is not live in Render until its verified GHCR image is deployed and its /health release revision is confirmed.
