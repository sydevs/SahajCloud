# Operator Scripts

One-off scripts an operator runs by hand from their own machine: external API
registration, one-time backfills, deployment helpers. Seeds live in `seeds/`,
not here.

## Conventions

- **Location**: `scripts/<name>.ts`. Run it with `pnpm tsx scripts/<name>.ts`.
- **Env access**: Read `process.env` directly. Do not use the validated
  `serverEnv` module — the script runs from a local shell and should not
  require every unrelated env var to be set.
- **Safety**: Add a `--force` flag to any destructive or state-changing
  script. Print a warning before it makes a change.
- **Example**: [scripts/setup-stream-webhook.ts](./setup-stream-webhook.ts)
  registers the Cloudflare Stream webhook and prints the signing secret.

## Existing scripts

| File | Purpose |
|---|---|
| `setup-stream-webhook.ts` | Register, inspect, or delete the account-level Cloudflare Stream webhook |
| `preview-event-emails.ts` | Send the manager event-verification reminders (all levels/audiences, with the listing-suggestions section populated) to the Mailpit capture inbox |
| `preview-registration-emails.ts` | Send the registrant confirmation in each state (online/offline, locale, branded/fallback, one-off, minimal) to the Mailpit capture inbox, with the `.ics` attached |
| `preview-registration-notification-emails.ts` | Send the manager registration notice (#588) to the Mailpit capture inbox. Covers each state: named manager, override address, no session, long title |
| `preview-reminder-digest-emails.ts` | Send the registrant session reminder + manager registration digest (#589) in each state (online/offline, locale, branded/fallback, daily/weekly) to the Mailpit capture inbox |
| `cleanup-preview-assets.ts` | Reap preview-namespaced Cloudflare Images / Stream / R2 assets older than `--days` (#432). Dry run by default, `--apply` to delete. Runs nightly via `.github/workflows/cleanup-preview-assets.yml`. Needs `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_KEY`, `R2_BUCKET` — one token covers all three backends, see `docs/rules/storage.md` |
| `repair-r2-meditation-filenames.ts` | Backfill or fix R2 filenames on existing meditations |
| `create-sample-page.ts` | Generate a sample Pages document |
| `backfill-schedule-last-date.ts` | Recompute the derived `schedule.lastDate` column on existing `events` + `app-cards` rows (#603). Dry run by default, `--force` to write, re-runnable. Routine lives in `src/lib/schedule/backfillLastDate.ts` |
| `verify-embed-live.ts` | Exercise the Cloudflare Browser Rendering integration against real pages (#633). `--self-test` proves all four outcomes without a live site. Pass URLs to diagnose why a service's canonical was disabled. Calls the same `verifyEmbed()` the nightly job does, so a green run is evidence about production. Costs one Browser Rendering call per URL |
| `backfill-region-breadcrumb-urls.ts` | Repopulate `breadcrumbs[].url` on existing regions after `generateURL` was enabled (#634), which is what makes `where[breadcrumbs.url][equals]=…` resolve. Dry run by default, `--force` to write, re-runnable. Re-saves **roots only** — the nested-docs cascade visits each subtree once, so re-saving every region would repeat the work per ancestor. Routine lives in `src/lib/atlas/backfillBreadcrumbUrls.ts` |
| `audit-region-slugs.ts` | Report regions with a blank slug, plus the descendants that inherit the gap and resolve no canonical URL (#634). **Read-only, no `--force`** — the right name for each row is a human decision, not something derivable from the data |
| `get-railway-preview-url.ts` | Find the PR's Railway preview URL from Railway's **GitHub commit status** (no Railway token), wait for `/api/health`, and export `PREVIEW_URL` for the smoke lane. Run by `ci.yml`, not by hand. Exits non-zero on the two cases that must not read as green (#661): a deploy that succeeds but publishes no host (base-environment misconfiguration — see `RAILWAY_RUNBOOK.md`), and a run where every statuses read failed, so whether a preview exists was never established. A genuinely absent, failed, or still-building preview still exits 0 and skips |
| `railway-preview-status.ts` | The decision half of the above: classify a commit status (`ready` / `unpublished` / `pending` / `failed` / `absent`) and poll to a terminal state. Pure — no network, no clock — so `tests/unit/railway-preview-status.spec.ts` covers it |
| `postinstall.cjs` | Runs after `pnpm install` |
