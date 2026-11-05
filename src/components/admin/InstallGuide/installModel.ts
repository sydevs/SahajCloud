import type { StepId, Track, TrackId } from './steps'

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
  /** `null` while the address has a problem, which matches nothing. */
  atlasUrl: string | null
}): ReportedMount[] {
  const { embedMetadata, atlasUrl } = args
  if (atlasUrl === null || !embedMetadata || typeof embedMetadata !== 'object') return []

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
  atlasUrl: string | null
  /** `null` until the volunteer has chosen one; the stage needs none, the steps do. */
  track: Track | null
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

  // No message: a step's messages render only as its failure list, so a
  // waiting note would show up there in red beside a real failure.
  if (track) note(track.checks.noReport, candidate === null ? 'unknown' : 'pass')

  for (const result of results) {
    if (!track || result.status === 'skipped') continue
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
    'Follow the steps below. This page checks by itself as soon as the atlas appears on your site, so you can leave it open while you work.',
  seen: 'Your atlas is showing on your site. Confirming it now.',
  verifying: 'Checking your site…',
  verified: 'Your atlas is live, and search engines can read your class pages.',
  warnings:
    'Your atlas is live and nobody visiting your site is affected — but search engines cannot read part of it. The steps marked below say what to redo.',
  failed:
    'The atlas was reported on this page, but the CMS could not confirm it by loading the page itself. The step marked below is the one to check.',
}

/** How one row of the progress table stands. */
export type MilestoneState = 'done' | 'failed' | 'warning' | 'todo'

export interface Milestone {
  id: 'seen' | 'confirmed' | 'region' | 'routing' | 'search'
  label: string
  state: MilestoneState
  detail: string
}

/**
 * The progress table: what is done, in the order it happens.
 *
 * ⚠ **Only rows the chosen track can finish.** An iframe has no addresses of its
 * own and nothing a search engine can read, so it gets neither row — a row that
 * can never turn green would leave the count short for good and read as a
 * failure of the install rather than of the track.
 */
export function buildMilestones(args: {
  model: InstallModel
  verification: CanonicalVerification | null | undefined
  canonicalEmbed: string | null
  hasRegion: boolean
  trackId: TrackId | null
}): Milestone[] {
  const { model, verification, canonicalEmbed, hasRegion, trackId } = args
  const [first, ...rest] = model.reported
  const problems = model.failures.length

  const milestones: Milestone[] = [
    {
      id: 'seen',
      label: 'Found on your site',
      state: first ? 'done' : 'todo',
      detail: first
        ? `${first.host}${first.mount}${rest.length > 0 ? ` and ${rest.length} more` : ''}`
        : 'Not yet',
    },
    {
      id: 'confirmed',
      label: 'Confirmed by the CMS',
      state: verification?.verified ? 'done' : model.stage === 'failed' ? 'failed' : 'todo',
      detail: verification?.verified
        ? 'Yes'
        : model.stage === 'failed'
          ? 'Could not load the page'
          : model.stage === 'verifying'
            ? 'Checking…'
            : 'Not yet',
    },
  ]
  if (trackId === 'iframe') return milestones

  return [
    ...milestones,
    {
      id: 'region',
      label: 'Owns its region’s addresses',
      state: canonicalEmbed ? 'done' : hasRegion ? 'todo' : 'warning',
      detail: canonicalEmbed ? 'Yes' : hasRegion ? 'Not yet' : 'No region set',
    },
    {
      id: 'routing',
      label: 'Each class has its own address',
      state: verification?.routingProbe?.verdict === 'path' ? 'done' : 'todo',
      detail:
        verification?.routingProbe?.verdict === 'path'
          ? 'Yes'
          : verification?.routingProbe
            ? 'Uses ?atlas='
            : 'Not yet',
    },
    {
      id: 'search',
      label: 'Readable by search engines',
      state: !verification?.seo ? 'todo' : problems > 0 ? 'failed' : 'done',
      detail: !verification?.seo
        ? 'Not checked yet'
        : problems > 0
          ? `${problems} problem${problems === 1 ? '' : 's'}`
          : 'Yes',
    },
  ]
}
