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
 * Env:
 *   GITHUB_TOKEN         - GitHub token (CI default), workflow needs `statuses: read`
 *   GITHUB_REPOSITORY    - "owner/repo" (CI default)
 *   PR_HEAD_SHA          - PR head commit SHA (github.event.pull_request.head.sha)
 *   STATUS_CONTEXT_MATCH - substring of the Railway status context (default "SahajCloud")
 *   HEALTH_PATH          - health endpoint (default "/api/health")
 *
 * This script skips gracefully, with an empty preview_url and exit 0,
 * when no Railway preview status appears. For example, a PR whose own
 * branch is a deployed environment, or a run with no token. It writes
 * `preview_url=<url>` to $GITHUB_OUTPUT and `PREVIEW_URL=<url>` to
 * $GITHUB_ENV.
 */
import { appendFileSync } from 'node:fs'

const GH_TOKEN = process.env.GITHUB_TOKEN
const REPO = process.env.GITHUB_REPOSITORY
const SHA = process.env.PR_HEAD_SHA
const CONTEXT_MATCH = process.env.STATUS_CONTEXT_MATCH || 'SahajCloud'
const HEALTH_PATH = process.env.HEALTH_PATH || '/api/health'

const DISCOVER_TIMEOUT_MS = 12 * 60_000 // Railway build and deploy is slow
const HEALTH_TIMEOUT_MS = 5 * 60_000
const POLL_INTERVAL_MS = 15_000
const DOMAIN_RE = /([a-z0-9-]+\.(?:up\.)?railway\.app)/i

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

interface CommitStatus {
  context?: string
  state?: string
  description?: string
}

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
  if (!res.ok) throw new Error(`GitHub statuses API: HTTP ${res.status}`)
  return (await res.json()) as CommitStatus[]
}

// GitHub returns statuses most-recent first. The first match per context is current.
async function findRailwayStatus(): Promise<{
  state: string
  url: string | null
  description: string
} | null> {
  const statuses = await fetchStatuses()
  const match = statuses.find((s) => (s.context || '').includes(CONTEXT_MATCH))
  if (!match) return null
  const domain = (match.description || '').match(DOMAIN_RE)
  return {
    state: match.state || 'unknown',
    url: domain ? `https://${domain[1]}` : null,
    description: match.description || '',
  }
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

  const deadline = Date.now() + DISCOVER_TIMEOUT_MS
  let url: string | null = null
  while (Date.now() < deadline) {
    let status = null
    try {
      status = await findRailwayStatus()
    } catch (err) {
      console.error(`status check: ${(err as Error).message}`)
    }
    if (status) {
      console.error(`railway status: state=${status.state} desc="${status.description}"`)
      if (status.state === 'success' && status.url) {
        url = status.url
        break
      }
      if (status.state === 'failure' || status.state === 'error') {
        console.error('Railway preview deploy reported failure — skipping smoke.')
        exportUrl('')
        return
      }
    } else {
      console.error('no Railway preview status on the PR head commit yet...')
    }
    await sleep(POLL_INTERVAL_MS)
  }

  if (!url) {
    console.error('No Railway preview URL found within timeout — skipping smoke.')
    exportUrl('')
    return
  }

  console.error(`preview URL: ${url}`)
  if (!(await waitHealthy(url))) {
    console.error('Preview environment never became healthy.')
    process.exit(1)
  }
  exportUrl(url)
  console.log(url)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
