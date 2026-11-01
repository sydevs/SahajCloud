import type { StepId, Track } from './steps'

import type { EmbedMetadata } from '@/lib/clients/embedMetadata'
import type { CanonicalVerification, SeoCheckResult } from '@/lib/clients/verification'
import { splitMountKey } from '@/lib/clients/verification'

import { stepForCheck } from './steps'

/**
 * What the Install tab is showing, derived from the service's own record.
 *
 * Pure, so `tests/unit/install-model.spec.ts` drives every state the tab can be
 * in without a browser — including the two nobody can set up by hand: a report
 * arriving for the chosen page while the tab is open, and a check failing on one
 * page and passing on another.
 */

/** A mount the widget has reported, matched against the address being set up. */
export interface ReportedMount {
  /** The `origin + pathname` key, which is what `canonical.embed` stores. */
  key: string
  host: string
  mount: string
  lastSeen?: string
}

/**
 * The reported mounts whose page is the address being installed.
 *
 * ⚠ **Matched on the path, not the host.** The volunteer types `/classes`; only
 * their own site knows what origin it serves that from, and a service may have
 * reported several hosts (a staging copy, a www and an apex). So every mount at
 * that path counts as the atlas showing up, and the one chosen as canonical is
 * the most recently seen — which is the live one.
 *
 * A WordPress permalink mount (`/?p=42`) is compared with its query intact,
 * because that query *is* the page there.
 */
export function reportedMountsFor(args: {
  embedMetadata: EmbedMetadata | null | undefined
  atlasUrl: string
}): ReportedMount[] {
  const { embedMetadata, atlasUrl } = args
  if (!embedMetadata || typeof embedMetadata !== 'object') return []

  const wanted = normalizeMountPath(atlasUrl)
  const mounts: ReportedMount[] = []

  for (const [key, record] of Object.entries(embedMetadata)) {
    const split = splitMountKey(key)
    if (!split || normalizeMountPath(split.mount) !== wanted) continue
    const lastSeen = (record as { lastSeen?: unknown } | null)?.lastSeen
    mounts.push({
      key,
      host: split.domain,
      mount: split.mount,
      lastSeen: typeof lastSeen === 'string' ? lastSeen : undefined,
    })
  }

  // Newest first, so the live host wins over a staging copy reported last month.
  return mounts.sort((a, b) => (b.lastSeen ?? '').localeCompare(a.lastSeen ?? ''))
}

/** A mount path, compared the way two spellings of one page should be. */
function normalizeMountPath(mount: string): string {
  const [path, query] = mount.split('?')
  const trimmed = `/${path.split('/').filter(Boolean).join('/')}`
  return query ? `${trimmed}?${query}` : trimmed
}

/** How far along the install is. One answer, for the banner at the top. */
export type InstallStage = 'waiting' | 'seen' | 'verifying' | 'verified' | 'warnings' | 'failed'

/** What one step's light says, and why. */
export interface StepStatus {
  state: 'pass' | 'fail' | 'unknown'
  /** Shown beside the step. Empty for `unknown`. */
  messages: string[]
}

export interface InstallModel {
  stage: InstallStage
  /** The mount this install will claim as canonical, newest report first. */
  candidate: ReportedMount | null
  /** Every reported mount at the chosen address, for the status panel. */
  reported: ReportedMount[]
  /** Keyed by step, so each step renders its own result. */
  stepStatus: Partial<Record<StepId, StepStatus>>
  /** Failures the volunteer has to act on, in step order. */
  failures: SeoCheckResult[]
}

/**
 * The whole tab's state, from the record and the chosen address.
 *
 * **The stage ladder is deliberately not the verification ladder.** A volunteer
 * does not care whether the mount ladder counted a strike; they care which of
 * four things is true: nothing has shown up yet, it has shown up, it is
 * confirmed, or it is confirmed and a search engine cannot read it. `warnings`
 * is the last of those, and it is the state this whole tab exists to make
 * visible — a site that looks perfect to whoever installed it and is
 * unindexable.
 */
export function buildInstallModel(args: {
  embedMetadata: EmbedMetadata | null | undefined
  verification: CanonicalVerification | null | undefined
  atlasUrl: string
  track: Track
  /** True while the tab is running verification or the checks. */
  busy?: boolean
}): InstallModel {
  const { embedMetadata, verification, atlasUrl, track, busy = false } = args

  const reported = reportedMountsFor({ embedMetadata, atlasUrl })
  const candidate = reported[0] ?? null
  const results = verification?.seo?.results ?? []
  const failures = results.filter((result) => result.status === 'fail')

  const stepStatus: Partial<Record<StepId, StepStatus>> = {}
  const note = (step: StepId, state: StepStatus['state'], message?: string) => {
    const existing = stepStatus[step]
    // A failure outranks a pass on the same step: two pages share one step, and
    // a step confirmed on the root and broken on a region is broken.
    const next: StepStatus['state'] =
      existing?.state === 'fail' || state === 'fail' ? 'fail' : state
    stepStatus[step] = {
      state: next,
      messages: [...(existing?.messages ?? []), ...(message ? [message] : [])],
    }
  }

  if (candidate === null) {
    note(track.checks.noReport, 'unknown', 'Waiting for the atlas to report itself from this page.')
  } else {
    note(track.checks.noReport, 'pass')
  }

  for (const result of results) {
    if (result.status === 'skipped') continue
    const step = stepForCheck(track, result.check)
    const where = result.route === '/' ? 'the main page' : `the page at ${result.route}`
    note(
      step,
      result.status === 'pass' ? 'pass' : 'fail',
      result.status === 'fail'
        ? `On ${where}: ${result.detail ?? 'this is not what the CMS published.'}`
        : undefined,
    )
  }

  const stage: InstallStage = busy
    ? 'verifying'
    : candidate === null
      ? 'waiting'
      : !verification?.verified
        ? reported.length > 0 && (verification?.attempts.length ?? 0) > 0
          ? 'failed'
          : 'seen'
        : failures.length > 0
          ? 'warnings'
          : 'verified'

  return { stage, candidate, reported, stepStatus, failures }
}

/** One sentence for the banner, per stage. */
export const STAGE_MESSAGES: Record<InstallStage, string> = {
  waiting:
    'Follow the steps below. This page checks by itself as soon as the atlas appears on your site — there is nothing to click.',
  seen: 'Your atlas is showing on your site. Confirming it now.',
  verifying: 'Checking your site…',
  verified: 'Your atlas is live, and search engines can read your class pages.',
  warnings:
    'Your atlas is live and nobody visiting your site is affected — but search engines cannot read part of it. The steps marked below say what to redo.',
  failed:
    'The atlas was reported on this page, but the CMS could not confirm it by loading the page itself. The step marked below is the one to check.',
}
