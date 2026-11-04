# Adaptive Knowledge Engine — rollout and controls

Status: implementation in progress; **disabled by default**. Do not enable on production until the end-to-end test passes.

## Free-tier architecture
- LeadFlow owns two isolated PostgreSQL collections: `business` and `prospects`. Documents, feedback, and outcomes are stored in namespaced `kb_*` tables.
- Uploads support text, Markdown, PDF and DOCX with a 1.4 MB file cap. Scanned PDFs need OCR and are not supported. Extracted text is limited to 120,000 characters per document.
- PostgreSQL full-text search is used instead of paid embeddings. Feedback applies bounded ranking changes; this is not model fine-tuning.
- Growth Lens reads evidence through LeadFlow's shared-token API. Growth Lens's knowledge endpoints require the existing `GROWTHLENS_PRIVATE_KEY` owner credential through `X-GrowthLens-Key`; the UI reuses the private access key already entered by the owner.
- Offers are evidence previews, not autonomous emails. Human review and existing send confirmation remain mandatory.
- `kb_outcomes` stores manually recorded outreach stages. Counts are observational, not causal revenue estimates.

## Enable only after verification
1. Verify Neon database URL, free-tier capacity, and backups; do not copy secrets into tickets.
2. Set `KNOWLEDGE_BASE_ENABLED=true` on LeadFlow backend only, then verify its authenticated `/knowledge` actions `status`, `ingest`, `search`, `feedback`, `learning-summary`, `offer-preview`.
3. Test PDF and DOCX ingestion with non-sensitive fixtures and verify no content appears in the wrong collection.
4. Confirm the existing `GROWTHLENS_PRIVATE_KEY` is configured in Growth Lens; enable its feature flag only after the shared-token endpoint is tested.
5. Verify authenticated Growth Lens `/api/intelligence/knowledge-search`, `/api/intelligence/knowledge-context` and the audit evidence panel; verify unauthenticated requests return 401.
6. Verify existing LeadFlow search, Gmail OAuth and confirmation, and Growth Lens audit reports.

## Disable and rollback
Set `KNOWLEDGE_BASE_ENABLED=false` in both services and redeploy. Do not delete database tables as part of a routine rollback. See `docs/KNOWLEDGE_BASE_ROLLBACK.md` for restore branches, Neon snapshot, and removal procedure. Never drop `kb_*` tables without an explicit approval and data export.

## Known limitations
No OCR, no automatic background crawling of private documents, no automated model retraining, no verified conversion uplift. A live database integration test and security review are required before rollout.

## Learning controls
- A document receiving at least two `incorrect` feedback events is flagged for review and excluded from assembled offer context until corrected or replaced. It remains visible in search for inspection.
- Observed `qualified`, `won`, and `lost` outcomes adjust document retrieval scores only within fixed bounds. They do not prove causality.
- Use the document manager to archive superseded content. Archiving is reversible using the Archived documents / Restore UI.
- Source IDs remain attached to evidence; do not copy generated previews into automatic send queues.

## Release acceptance criteria
- Both repositories' automated tests pass on the exact deployed commit.
- Render deploy status is `live` for both services.
- Verify feature flags are off and private endpoints reject unauthorized requests.
- Verify PDF, DOCX, TXT and MD ingestion with non-sensitive samples in an isolated database.
- Verify feedback changes ranking, disputed documents are excluded from offer previews, and business/prospect collections remain separate.
- Verify a Growth Lens audit can retrieve evidence through the shared token without modifying existing audit reports.
- Confirm Gmail sending still requires explicit approval.

## CI release gate
The LeadFlow test workflow now installs open-source PDF.js and Mammoth parsers, generates real PDF and DOCX fixtures, and starts a disposable PostgreSQL 16 service. The knowledge integration suite checks ingestion, deduplication, collection isolation, search, sourced offer previews, disputed-document exclusion, feedback, observed outcomes, archive and restore. These tests do not use production Neon data.

## Production rollout status
- Knowledge flags were enabled on the existing free Render services on 2026-11-04. The LeadFlow knowledge tables were created in the existing Neon production branch and contain no uploaded customer documents at the time of verification.
- The Growth Lens audit UI retrieves evidence using the existing private access key; no second credential is required.
- Release verification should inspect Render health for `knowledgeBase.enabled` and `knowledgeBase.storageReady`, and confirm both GitHub Actions test suites pass on the deployed commits.
- To disable quickly, set `KNOWLEDGE_BASE_ENABLED=false` on both services; keep `kb_*` tables intact.

## Automated Intelligence Engine
Set `INTELLIGENCE_AUTOMATION_ENABLED=true` on LeadFlow to start an automatic analysis cycle about 12 seconds after startup and then every 15 minutes by default (`INTELLIGENCE_ENGINE_INTERVAL_MS` can adjust the interval). It scans the 200 most recent unarchived **business** knowledge documents for five transparent opportunity categories: conversion, performance, retention, accessibility, and discoverability. It creates deduplicated, document-linked tasks in `kb_intelligence_tasks` and never sends messages or modifies Growth Lens audit findings. The LeadFlow Automated Intelligence Engine panel shows status, allows a manual cycle, and offers approve/dismiss review actions. Approving a recommendation does **not** send outreach. No AI model training, autonomous crawling, customer-email sending, or verified revenue inference is performed by this cycle. To stop it, set `INTELLIGENCE_AUTOMATION_ENABLED=false` and redeploy. This feature uses the existing free Neon/PostgreSQL and Render infrastructure; avoid aggressive intervals on free tiers.

## Automatic website research (no manual document upload required)
The scheduler now rotates through the complete indexed OpenStreetMap business list in batches of up to 100 per cycle, deduplicating by stable source key. It automatically researches up to three HTTPS websites per cycle using the existing private-network/SSRF protections, strict redirect handling, robots.txt permission checks, response size and time limits. Results are stored as a limited verified page-title/meta-description summary or an explicit unavailable status; no page findings or revenue outcomes are invented. Research is retried after seven days, and individual failures do not halt the cycle. The private automation dashboard shows prospect counts, website research coverage and review backlog. A prospect brief can include this source-linked evidence and an unsent draft without uploading any documents. Knowledge-document-specific recommendations remain empty until actual knowledge is supplied; that is separate from the automated prospect pipeline.
