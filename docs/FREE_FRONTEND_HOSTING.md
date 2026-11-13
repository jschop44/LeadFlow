# LeadFlow frontend on free GitHub Pages

LeadFlow's original Render static site can fail to build when the free workspace exhausts its monthly build-pipeline minutes. The **Research API** container itself can still host the latest frontend at https://leadflow-research-api.onrender.com/app .

This repository also publishes the current **single-file** `index.html` interface through an independently hosted, free GitHub Pages deployment:

- Expected URL **after successful Pages deployment:** https://jschop44.github.io/LeadFlow/
- Workflow: `.github/workflows/deploy-pages.yml`
- Runs when the frontend or its Pages workflow changes on `main`, or manually through `workflow_dispatch`.
- Uploads **only** `index.html` from an isolated `_site` build directory. It does not publish backend server code, tests, workflow files, `.env` or data snapshots.

The Pages frontend is static. All searches, company research, security checks and authenticated outreach still use the existing Render Research API, which must be live. Pages is **not** a replacement for the API or Neon database. The API explicitly permits only the exact `https://jschop44.github.io` browser origin alongside its existing allowed Render origins. API tokens and Gmail sessions are never committed into this public frontend deployment; the UI continues to require the user's own credentials.

For Gmail authorization, the frontend passes the exact `https://jschop44.github.io/LeadFlow/` callback destination, which is on the backend's fixed allowlist. It does **not** allow arbitrary redirect URLs or third-party Pages origins.

## First-time activation

In the GitHub repository, open **Settings > Pages** and set **Build and deployment > Source** to **GitHub Actions** if the Pages deployment has not already been enabled. Then check **Actions > Deploy LeadFlow frontend to GitHub Pages** for a successful `deploy-pages` job. Some repository plans and settings require the owner to enable Pages before first publication.

Do not claim the Pages URL works until a successful Pages deployment is visible in GitHub Actions and the URL itself opens. If Pages is unavailable or disabled, continue using the backend-hosted **/app** interface.

## Checks

Run `node --test backend/test/pages-deployment.test.mjs backend/test/email-oauth.test.mjs backend/test/smoke.test.mjs` and the repository's normal regression/safety workflows before merging.

**Limitations:** Render's separate static site is still constrained by build minutes; Github Pages builds use the GitHub Pages workflow rather than restoring Render minutes. Free-tier provider and API quotas remain in force.
