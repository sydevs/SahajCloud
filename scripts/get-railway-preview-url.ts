#!/usr/bin/env node
/**
 * Find the Railway PR-preview URL for the current pull request. Wait
 * until it is healthy, then export it as PREVIEW_URL for the
 * Playwright smoke specs.
 *
 * When Railway deploys a per-PR preview environment, it posts a GitHub
 * commit status on the PR's head commit. That status's description
 * carries the public URL, for example
 * `"Success - sahajcloud-sahajcloud-pr-470.up.railway.app"`. The GitHub
 * Deployment's `environment_url` field only points at the Railway
 * dashboard, and a Railway project token cannot read other
 * environments' domains over the API. So the commit-status description
 * is the reliable source. This script reads it with the built-in
 * GITHUB_TOKEN. It needs no Railway API token.
 *
 * The description carries a host only while the base environment's
 * `SahajCloud` service holds a Railway-provided domain. Railway gives a
 * PR service a domain only when the base service has one, so removing it
 * from `production` silently strips every future PR of its preview URL,
 * leaving a bare `"Success"` (#661). See RAILWAY_RUNBOOK.md.
 *
 * Env:
 *   GITHUB_TOKEN         - GitHub token (CI default), workflow needs `statuses: read`
 *   GITHUB_REPOSITORY    - "owner/repo" (CI default)
 *   PR_HEAD_SHA          - PR head commit SHA (github.event.pull_request.head.sha)
 *   STATUS_CONTEXT_MATCH - substring of the Railway status context (default "SahajCloud")
 *   HEALTH_PATH          - health endpoint (default "/api/health")
 *
 * Three exit paths:
 *
 *   exit 0, url    - the deploy published a host and the preview answered
 *                    HEALTH_PATH. Smoke runs.
 *   exit 0, empty  - no Railway status within the timeout, a failed or
 *                    cancelled deploy, or missing env. There is genuinely
 *                    no preview to test, so the smoke lane skips and
 *                    ci.yml's `::warning` says so. A statuses API that
 *                    refused every read for the whole budget also lands
 *                    here, under its own `::warning`, because that cause
 *                    is transient.
 *   exit 1         - the deploy succeeded but published NO host, GitHub
 *                    refused the statuses read with 401/403, or the
 *                    preview never became healthy. All three are broken
 *                    configuration rather than an absent preview, and
 *                    must not read as green.
 *
 * It writes `preview_url=<url>` to $GITHUB_OUTPUT and `PREVIEW_URL=<url>`
 * to $GITHUB_ENV.
 */
import { appendFileSync } from 'node:fs'

import { discoverPreview, StatusFetchError, type CommitStatus } from './railway-preview-status'

const GH_TOKEN = process.env.GITHUB_TOKEN
const REPO = process.env.GITHUB_REPOSITORY
const SHA = process.env.PR_HEAD_SHA
const CONTEXT_MATCH = process.env.STATUS_CONTEXT_MATCH || 'SahajCloud'
const HEALTH_PATH = process.env.HEALTH_PATH || '/api/health'

const DISCOVER_TIMEOUT_MS = 12 * 60_000 // Railway build and deploy is slow
const HEALTH_TIMEOUT_MS = 5 * 60_000
const POLL_INTERVAL_MS = 15_000

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function fetchStatuses(): Promise<CommitStatus[]> {
  const res = await fetch(
    `https://api.github.com/repos/${REPO}/commits/${SHA}/statuses?per_page=100`,
    {
      headers: {
        Authorization: `Bearer ${GH_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'sahajcloud-preview-discovery',
      },
    },
  )
  if (!res.ok) throw new StatusFetchError(`GitHub statuses API: HTTP ${res.status}`, res.status)
  return (await res.json()) as CommitStatus[]
}

async function waitHealthy(url: string): Promise<boolean> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS
  let attempt = 0
  while (Date.now() < deadline) {
    attempt++
    try {
      const res = await fetch(`${url}${HEALTH_PATH}`, { signal: AbortSignal.timeout(10_000) })
      if (res.ok) {
        console.error(`preview healthy after ${attempt} attempt(s)`)
        return true
      }
      console.error(`health attempt ${attempt}: HTTP ${res.status}`)
    } catch (err) {
      console.error(`health attempt ${attempt}: ${(err as Error).message}`)
    }
    await sleep(POLL_INTERVAL_MS)
  }
  return false
}

function exportUrl(url: string): void {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `preview_url=${url}\n`)
  if (url && process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV, `PREVIEW_URL=${url}\n`)
}

async function main(): Promise<void> {
  if (!GH_TOKEN || !REPO || !SHA) {
    console.error('Missing GITHUB_TOKEN / GITHUB_REPOSITORY / PR_HEAD_SHA — skipping discovery.')
    exportUrl('')
    return
  }

  const outcome = await discoverPreview({
    fetchStatuses,
    contextMatch: CONTEXT_MATCH,
    timeoutMs: DISCOVER_TIMEOUT_MS,
    pollIntervalMs: POLL_INTERVAL_MS,
    sleep,
    now: Date.now,
    log: console.error,
  })

  if (outcome.kind === 'unpublished') {
    // Fail closed, and do not restate the remediation here — the runbook
    // owns it, and a copy in this string is the one that goes stale.
    // Re-running will not help: the deploy already succeeded.
    console.error(
      '::error title=Railway preview has no URL::The Railway deploy succeeded but published no ' +
        'host, so the smoke lane has nothing to test. This is base-environment configuration, ' +
        'not a transient failure — re-running produces the same result. Fix: RAILWAY_RUNBOOK.md, ' +
        '"PR previews inherit their domain from production".',
    )
    exportUrl('')
    process.exit(1)
  }

  if (outcome.kind === 'forbidden') {
    // Never having looked is not evidence of absence: a revoked
    // `statuses: read` scope reads exactly like a PR with no preview
    // environment. GitHub will not relent inside one run, so this is
    // terminal on the first refusal rather than 12 minutes later.
    console.error(
      `::error title=Railway preview discovery was refused::GitHub refused the statuses read ` +
        `(${outcome.message}), so whether a preview exists is unknown. Check the workflow's ` +
        `\`statuses: read\` permission and GITHUB_TOKEN. Re-running will not help while the ` +
        `token lacks the scope.`,
    )
    exportUrl('')
    process.exit(1)
  }

  if (outcome.kind === 'failed') {
    console.error(`Railway preview deploy reported ${outcome.state} — skipping smoke.`)
    exportUrl('')
    return
  }

  if (outcome.kind === 'timeout') {
    const seconds = Math.round(outcome.elapsedMs / 1000)

    // Every read failed, so we never actually looked, and "no preview
    // exists" would overstate what we know. The permanent causes already
    // exited above, so what is left is transient — a statuses-API incident
    // outlasting the deadline. That must not redden every open PR, so it
    // warns and skips rather than failing.
    if (outcome.reads === 0) {
      console.error(
        `::warning title=Railway preview discovery could not read any status::All ` +
          `${outcome.errors} request(s) to the GitHub statuses API failed over ${seconds}s, so ` +
          `whether a preview exists was never established. Smoke is skipping on an unknown, ` +
          `not on an absent preview.`,
      )
      exportUrl('')
      return
    }

    console.error(
      outcome.last.kind === 'absent'
        ? `No Railway preview status appeared in ${seconds}s — skipping smoke.`
        : `Railway preview never left ${outcome.last.kind} in ${seconds}s — skipping smoke.`,
    )
    exportUrl('')
    return
  }

  console.error(`preview URL: ${outcome.url}`)
  if (!(await waitHealthy(outcome.url))) {
    console.error('Preview environment never became healthy.')
    process.exit(1)
  }
  exportUrl(outcome.url)
  console.log(outcome.url)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
