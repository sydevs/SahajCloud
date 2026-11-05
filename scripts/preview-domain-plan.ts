/**
 * The decision half of `scripts/preview-domain.ts`: which per-PR preview
 * addresses the daily sweep should delete.
 *
 * Pure — no network, no clock — so `tests/unit/preview-domain-plan.spec.ts`
 * covers it. The CLI half holds the Cloudflare and GitHub calls.
 */

/** One Workers Custom Domain as Cloudflare lists it. */
export interface PreviewDomain {
  hostname: string
  id: string
}

/** What GitHub says about one pull request. */
export interface PullRequestState {
  /** ISO timestamp, or `null` while the PR is open. */
  closedAt: null | string
  number: number
}

/** One address the sweep will delete, and why. */
export interface SweepTarget {
  domainId: string
  hostname: string
  pr: string
  reason: string
}

/**
 * The addresses to delete, given every Custom Domain on the Worker and the
 * state of the pull requests they name.
 *
 * Two rules, and the second is the load-bearing one:
 *
 * - **An open PR keeps its address however old it is.** A long-running PR is
 *   exactly the one a reviewer comes back to, so age alone is never a reason.
 * - **A PR nobody can account for is left alone.** An address whose PR GitHub
 *   did not report — a read that failed, a number from another repository — is
 *   not evidence the PR is closed, and deleting on that unknown would take a
 *   live preview down.
 *
 * The grace window exists because a PR is often reopened within minutes of
 * closing, and recreating the Custom Domain costs a new edge certificate.
 */
export function sweepTargets({
  domains,
  graceMs,
  now,
  pullRequests,
}: {
  domains: PreviewDomain[]
  graceMs: number
  now: number
  pullRequests: PullRequestState[]
}): SweepTarget[] {
  const closedAt = new Map(pullRequests.map((pr) => [String(pr.number), pr.closedAt]))
  const targets: SweepTarget[] = []

  for (const domain of domains) {
    const pr = /^pr-(\d+)\./.exec(domain.hostname)?.[1]
    if (!pr) continue
    if (!closedAt.has(pr)) continue

    const closed = closedAt.get(pr)
    if (!closed) continue

    const closedMs = Date.parse(closed)
    if (!Number.isFinite(closedMs) || now - closedMs < graceMs) continue

    targets.push({
      domainId: domain.id,
      hostname: domain.hostname,
      pr,
      reason: `pull request #${pr} closed ${closed}`,
    })
  }

  return targets
}
