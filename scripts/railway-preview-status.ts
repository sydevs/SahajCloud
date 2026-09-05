/**
 * Decide what Railway's commit status says about a PR preview.
 *
 * Split out of `get-railway-preview-url.ts` so the decision is testable
 * without network, a clock, or a direct-run guard on the CI entrypoint.
 * That script keeps the environment, the GitHub fetch, the health check
 * and the exit codes. This module only classifies and polls.
 *
 * The case that matters is `unpublished`: Railway reports `success` but
 * publishes no host. Discovery used to treat that as "not ready yet" and
 * re-read the identical status every 15s for 12 minutes, then skip the
 * smoke lane and exit 0 — so `Lint, Test & Smoke: pass` meant "unit +
 * integration passed" on every PR for weeks (#661). A deploy that
 * succeeds without a host is a base-environment misconfiguration, not an
 * absent preview, and it is terminal on the first poll.
 */

export interface CommitStatus {
  context?: string
  state?: string
  description?: string
}

/** A Railway status that has stopped changing, or one that has not started. */
export type PreviewStatus =
  | { kind: 'absent' }
  | { kind: 'pending'; state: string; description: string }
  | { kind: 'failed'; state: string; description: string }
  | { kind: 'unpublished'; state: string; description: string }
  | { kind: 'ready'; url: string; description: string }

/** Terminal outcome of a discovery run. `timeout` carries what it last saw. */
export type PreviewOutcome =
  | Exclude<PreviewStatus, { kind: 'absent' } | { kind: 'pending' }>
  | { kind: 'timeout'; last: PreviewStatus; elapsedMs: number }

const DOMAIN_RE = /([a-z0-9-]+\.(?:up\.)?railway\.app)/i

/**
 * Classify the current Railway status for `contextMatch`.
 *
 * GitHub returns statuses most-recent first, so the first context match is
 * the current one. Later entries are that context's own history.
 */
export function classifyStatuses(
  statuses: CommitStatus[],
  contextMatch: string,
): PreviewStatus {
  const match = statuses.find((s) => (s.context || '').includes(contextMatch))
  if (!match) return { kind: 'absent' }

  const state = match.state || 'unknown'
  const description = match.description || ''

  if (state === 'failure' || state === 'error') return { kind: 'failed', state, description }

  if (state === 'success') {
    const domain = description.match(DOMAIN_RE)
    return domain
      ? { kind: 'ready', url: `https://${domain[1]}`, description }
      : { kind: 'unpublished', state, description }
  }

  return { kind: 'pending', state, description }
}

export interface DiscoverDeps {
  fetchStatuses: () => Promise<CommitStatus[]>
  contextMatch: string
  timeoutMs: number
  pollIntervalMs: number
  sleep: (ms: number) => Promise<void>
  now: () => number
  log: (message: string) => void
}

/**
 * Poll until the status reaches a terminal state, or the deadline passes.
 *
 * Returns on the first `ready`, `failed` or `unpublished` without sleeping
 * again — the three states GitHub can never revise, because a commit
 * status is immutable and Railway writes state and description together.
 * A throwing fetch is logged and retried; only the deadline yields
 * `timeout`.
 */
export async function discoverPreview(deps: DiscoverDeps): Promise<PreviewOutcome> {
  const { fetchStatuses, contextMatch, timeoutMs, pollIntervalMs, sleep, now, log } = deps
  const start = now()
  const deadline = start + timeoutMs
  let last: PreviewStatus = { kind: 'absent' }

  while (now() < deadline) {
    let statuses: CommitStatus[] | null = null
    try {
      statuses = await fetchStatuses()
    } catch (err) {
      log(`status check: ${(err as Error).message}`)
    }

    if (statuses) {
      last = classifyStatuses(statuses, contextMatch)
      if (last.kind === 'absent') {
        log('no Railway preview status on the PR head commit yet...')
      } else {
        log(`railway status: state=${statusState(last)} desc="${last.description}"`)
      }
      if (last.kind === 'ready' || last.kind === 'failed' || last.kind === 'unpublished') {
        return last
      }
    }

    await sleep(pollIntervalMs)
  }

  return { kind: 'timeout', last, elapsedMs: now() - start }
}

function statusState(status: Exclude<PreviewStatus, { kind: 'absent' }>): string {
  return status.kind === 'ready' ? 'success' : status.state
}
