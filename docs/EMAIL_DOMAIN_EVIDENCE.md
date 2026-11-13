# Public Email Domain MX Evidence — LeadFlow

LeadFlow already extracts **published** company email addresses with their source pages and does not generate owner addresses. This upgrade adds a free public DNS MX-record check, without using a paid verifier or contacting individual mailboxes.

## How it works

For a user-requested company enrichment, LeadFlow inspects up to eight *unique email domains* found on the company's own permitted website pages. It checks public MX records using Node's DNS resolver and assigns one of these states:

| Status | Meaning |
|---|---|
| `mx_present` | Domain publishes inbound mail-exchange routing; **not evidence that a particular mailbox exists** |
| `null_mx` | Domain explicitly declares no inbound mail (RFC 7505) |
| `no_mx_observed` | No MX records observed; SMTP may still use A/AAAA fallback, so deliverability **unknown** |
| `domain_not_found` | Public DNS reports the domain does not exist |
| `dns_unavailable` | DNS resolver/network failure; do not claim address invalid |
| `not_checked` | Domain not checked or outside research budget |

Unusable domains with explicit null MX / nonexistent domain are ranked after other *observed published addresses*, but still remain available for inspection. Named owner emails are *not* inferred or generated. Owner identities, mailbox control, validity and deliverability are never asserted.

## Guardrails / performance

- Public DNS requests only; **no SMTP VRFY/RCPT or inbox probing**, no dark-web or hacked data, no automatic email sending.
- The existing `/enrich` route remains authenticated with `X-LeadFlow-Token` and already respects robots.txt, URL validation and bounded page crawling.
- At most 8 domains per enrichment, 3 concurrent DNS resolutions, 1.4-second per-domain deadline; positive/negative observations cached for one hour, and pending requests coalesced.
- No new paid API key, infrastructure or dependency.
- Results show a clearly labeled domain routing signal next to the website's email and export the status in CSV.
- A lack of MX records is **not** treated as proof of a nonexistent email address: SMTP delivery has fallback rules and some systems intentionally omit MX records.

Testing: `node --test backend/test/email-domain-evidence.test.mjs backend/test/research-execution.test.mjs` and normal LeadFlow GitHub CI.

Deployment: A green GitHub build only means code and container are verified; update the pinned Render service image or enable the existing optional deploy-hook secret before calling this live.
