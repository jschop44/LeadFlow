# Automatic verified container deployment — Render hook (free-first)

The existing GitHub Actions **Publish verified container** workflow already builds, tests, and publishes an immutable `sha-<commit>` image to GitHub Container Registry after the main-branch LeadFlow tests pass.

This change adds an optional final **Render deployment** handoff, without consuming Render's Git-source build pipeline minutes. Image-backed Render services accept a secure deploy hook with an `imgURL` parameter. It deploys the exact verified SHA-tagged container, rather than the old pinned digest or a mutable `latest` tag.

## One-time owner setup (no secret in chat or source control)

1. Open [LeadFlow Research API in Render](https://dashboard.render.com/web/srv-dbkhlo7b9u1s73bffq40), then **Settings → Deploy Hook**. Copy its secret HTTPS deploy-hook URL.
2. Open [LeadFlow GitHub Actions secrets](https://github.com/jschop44/LeadFlow/settings/secrets/actions) and create the **repository secret** `LEADFLOW_RENDER_DEPLOY_HOOK`; paste the exact Render deploy hook URL **there**, not into code, an issue, or a message.
3. On the next verified merge to `main`, GitHub Actions automatically builds, smoke-tests and pushes the immutable image, then calls the hook with `imgURL=ghcr.io/jschop44/leadflow-api:sha-<verified-SHA>`.
4. Inspect [GitHub Actions](https://github.com/jschop44/LeadFlow/actions) and the Render service's **Events**. Confirm `https://leadflow-research-api.onrender.com/health` reports the new full release SHA. Only then treat the new backend (including the built-in frontend at `/app`) as live.

The hook step **skips without error when the secret is absent** and states that the image was published but not deployed. It never prints the URL or its secret key, validates the official `api.render.com` HTTPS host, and is unreachable from pull-request code because the existing release workflow verifies that its SHA is current `main` and that main-branch tests passed.

The hook uses an override for this one deployment. The service's configured default image remains the older pinned digest until manually changed in Render; manual deploys without the override may therefore revert to the older image. To eliminate that risk, change its **Settings → Build → Source** reference to the verified GHCR image tag and keep the hook for future upgrades.

A successful hook response means **deployment requested**, not necessarily healthy or live. GHCR images may need to be publicly pullable or the existing Render registry credential must work. Render free-plan limits, downtime, and resource policies remain applicable.

Official documentation: https://render.com/docs/deploy-hooks and https://render.com/docs/deploying-an-image

## Rollback and safety

Delete or rotate the `LEADFLOW_RENDER_DEPLOY_HOOK` secret to disable automated deployments. Render's prior live deploy can be rolled back from its Dashboard. No user data is erased, existing OAuth secrets remain server-side, and a failed deployment does not send outreach messages.
