# LeadFlow / Growth Lens recovery and automation acceptance

## Verified recovery snapshot (2026-11-05 UTC)
- Production Neon project: `noisy-bread-73612102`, branch `br-green-union-b8v06iyf`.
- Pre-knowledge-base restore point: `br-raspy-hat-b8rljjhy` (2026-11-04).
- Isolated recovery snapshot: `br-dark-mode-b82r4iaj` (`recovery-drill-2026-11-05`), cloned from production.
- Snapshot read-only check: 280 prospects, 17 nationwide candidates, 17 verified audit records. These counts matched the production query at the time of checking. The recovery branch contained 0 KB documents.
- No production restore, overwrite, session termination, or destructive SQL was performed. Branch cloning and readback prove a recoverable snapshot can be created, **not** that a full application restore and cutover has passed.

## Safe recovery procedure
1. Pause GitHub Actions automation by disabling the scheduled workflow and stop in-process automation using the existing feature flags; preserve original flag values.
2. Record the deployed Render commit SHAs and take a fresh Neon branch snapshot from production before any changes.
3. On an isolated Neon branch, verify table structure, row counts, lead retrieval, prospect research statuses, audit findings, and application connection using branch-specific credentials.
4. If a production cutover is approved, coordinate a maintenance window, update the application database connection to the verified recovery branch, redeploy, and run authenticated end-to-end smoke tests.
5. Restore original feature flags and scheduled automation only after read/write health checks pass. Document evidence and rollback conditions. Do not delete any original branches until separately authorized.

## Automation acceptance
- Workflow: `.github/workflows/intelligence-schedule.yml` with cron `7,22,37,52 * * * *` and manual dispatch.
- Requires GitHub repository secret `LEADFLOW_AUTOMATION_TOKEN` matching the Render backend token. Never print tokens.
- A previous manual workflow dispatch passed; independent evidence of a **new scheduled** run is still required.
- Confirm a GitHub Actions run with event `schedule`, successful job conclusion, and backend `Intelligence cycle completed` near its execution time.
- Verify a second successful cycle after the first without advisory-lock skips; audit statuses must reflect actual evidence, not fabricated findings.
- Production snapshot and app cutover drill remain separately required for full disaster-recovery certification.

## Recovery drill evidence (2026-11-05 01:02 UTC)
- Named production snapshot `snap-fragrant-hall-b8eggcpm` was created.
- Snapshot restore generated branch `br-calm-dust-b8bwj6zk`, now named `snapshot-restore-drill-2026-11-05`.
- **Important:** Neon's restore action automatically finalized and temporarily changed the default branch and names. The original branch `br-green-union-b8v06iyf` was immediately reset as the default and renamed `production`. A subsequent independent read confirmed the original branch is the default, and both original and restored branches contain 280 prospects.
- Isolated recovery branch `br-dark-mode-b82r4iaj` passed a temporary-table write/read transaction using three recovered nationwide prospect records; temporary data was dropped on commit.
- Future recovery exercises must use explicit non-finalizing restore options and confirm default-branch identity before and after. Do not run automatic production cutovers for drills.
- Application-level connection against a restored branch remains untested; do not represent the drill as a complete application cutover.

## Scheduled-run observability
- GitHub Actions workflow now includes the event type and run ID in the authenticated request body. The backend logs the validated event type and run ID without tokens.
- A scheduled wake is proven only by a production log line `Authenticated automation wake` with `trigger=schedule`, a numeric run ID, and a corresponding successful intelligence cycle. A manual wake or startup cycle is not equivalent.
