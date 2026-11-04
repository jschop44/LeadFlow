# Adaptive Knowledge Engine — rollout and controls

Status: implementation in progress; **disabled by default**. Do not enable on production until the end-to-end test passes.

## Free-tier architecture
- LeadFlow owns two isolated PostgreSQL collections: `business` and `prospects`. Documents, feedback, and outcomes are stored in namespaced `kb_*` tables.
- Uploads support text, Markdown, PDF and DOCX with a 1.4 MB file cap. Scanned PDFs need OCR and are not supported. Extracted text is limited to 120,000 characters per document.
- PostgreSQL full-text search is used instead of paid embeddings. Feedback applies bounded ranking changes; this is not model fine-tuning.
- Growth Lens reads evidence through LeadFlow's shared-token API. Growth Lens's public-facing knowledge endpoints additionally require `GROWTHLENS_KNOWLEDGE_ACCESS_TOKEN`.
- Offers are evidence previews, not autonomous emails. Human review and existing send confirmation remain mandatory.
- `kb_outcomes` stores manually recorded outreach stages. Counts are observational, not causal revenue estimates.

## Enable only after verification
1. Verify Neon database URL, free-tier capacity, and backups; do not copy secrets into tickets.
2. Set `KNOWLEDGE_BASE_ENABLED=true` on LeadFlow backend only, then verify its authenticated `/knowledge` actions `status`, `ingest`, `search`, `feedback`, `learning-summary`, `offer-preview`.
3. Test PDF and DOCX ingestion with non-sensitive fixtures and verify no content appears in the wrong collection.
4. Configure a separate long random `GROWTHLENS_KNOWLEDGE_ACCESS_TOKEN` in Growth Lens; enable its feature flag only after the shared-token endpoint is tested.
5. Verify authenticated Growth Lens `/api/intelligence/knowledge-search` and `/api/intelligence/knowledge-context`; verify unauthenticated requests return 401.
6. Verify existing LeadFlow search, Gmail OAuth and confirmation, and Growth Lens audit reports.

## Disable and rollback
Set `KNOWLEDGE_BASE_ENABLED=false` in both services and redeploy. Do not delete database tables as part of a routine rollback. See `docs/KNOWLEDGE_BASE_ROLLBACK.md` for restore branches, Neon snapshot, and removal procedure. Never drop `kb_*` tables without an explicit approval and data export.

## Known limitations
No OCR, no automatic background crawling of private documents, no automated model retraining, no verified conversion uplift. A live database integration test and security review are required before rollout.
