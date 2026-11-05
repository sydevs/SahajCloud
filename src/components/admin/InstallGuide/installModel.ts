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

/** A banner the tab shows: its colour, its title, and one or two sentences. */
export interface BannerContent {
  type: 'default' | 'error' | 'success' | 'warning'
  title: string
  text: string
}

/** The banner at the top of the tab, per stage. */
export const STAGE_BANNERS: Record<InstallStage, BannerContent> = {
  waiting: {
    type: 'default',
    title: 'Not installed yet',
    text: 'Follow the steps below. This page notices by itself when the atlas appears on your site.',
  },
  seen: {
    type: 'default',
    title: 'Atlas found on your site',
    text: 'Confirming it now.',
  },
  verifying: { type: 'default', title: 'Checking your site…', text: 'This takes a few seconds.' },
  verified: {
    type: 'success',
    title: 'Your atlas is live',
    text: 'Visitors can use it, and search engines can read your class pages.',
  },
  warnings: {
    type: 'warning',
    title: 'Live, with search problems',
    text: 'Visitors are not affected, but search engines cannot read part of it. Redo the steps marked in red.',
  },
  failed: {
    type: 'error',
    title: 'Could not confirm the install',
    text: 'The atlas reported itself, but the CMS could not load the page. Check the step marked in red.',
  },
}

/**
 * How one row of the progress table stands.
 *
 * `na` is a row the chosen track can never finish. It is shown, so the volunteer
 * sees what the track gives up, and left out of the count, so the count can
 * still reach the end.
 */
export type MilestoneState = 'done' | 'failed' | 'warning' | 'todo' | 'na'

export interface Milestone {
  id: 'seen' | 'confirmed' | 'region' | 'routing' | 'search'
  label: string
  state: MilestoneState
  /** One of {@link MILESTONE_STATUS}, or "Checking…" while a check runs. */
  status: string
  /** A second line under the label, where there is something specific to say. */
  note?: string
}

/** The Status column's whole vocabulary, so every row reads the same way. */
export const MILESTONE_STATUS: Record<MilestoneState, string> = {
  done: 'Done',
  todo: 'Not yet',
  failed: 'Needs fixing',
  warning: 'Needs action',
  na: 'Not available',
}

/**
 * The progress table: what is done, in the order it happens.
 *
 * Every label is a thing and its state ("Atlas detected"), and every status is
 * one of five words, so the rows can be read down the column. What is specific
 * to one row — where the atlas was found, how many search problems — goes in
 * its note.
 *
 * ⚠ **An iframe cannot finish the last two rows.** It has no addresses of its
 * own and nothing a search engine can read, so they are `na`: shown, and out of
 * the count.
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
  const iframe = trackId === 'iframe'
  const row = (
    id: Milestone['id'],
    label: string,
    state: MilestoneState,
    note?: string,
  ): Milestone => ({ id, label, state, status: MILESTONE_STATUS[state], ...(note ? { note } : {}) })

  const confirmed: Milestone = verification?.verified
    ? row('confirmed', 'Install confirmed', 'done')
    : model.stage === 'failed'
      ? row('confirmed', 'Install confirmed', 'failed', 'The CMS could not load the page.')
      : {
          ...row('confirmed', 'Install confirmed', 'todo'),
          ...(model.stage === 'verifying' ? { status: 'Checking…' } : {}),
        }

  const probe = verification?.routingProbe?.verdict
  return [
    first
      ? row(
          'seen',
          'Atlas detected',
          'done',
          `${first.host}${first.mount}${rest.length > 0 ? ` and ${rest.length} more` : ''}`,
        )
      : row('seen', 'Atlas detected', 'todo'),
    confirmed,
    canonicalEmbed
      ? row('region', 'Region claimed', 'done')
      : hasRegion
        ? row('region', 'Region claimed', 'todo')
        : row('region', 'Region claimed', 'warning', 'Set a region on the Edit tab.'),
    iframe
      ? row('routing', 'Class addresses', 'na', 'An iframe has no addresses of its own.')
      : probe === 'path'
        ? row('routing', 'Class addresses', 'done')
        : row('routing', 'Class addresses', 'todo', probe ? 'Using ?atlas= addresses.' : undefined),
    iframe
      ? row('search', 'Search listings', 'na', 'Search engines cannot read an iframe.')
      : !verification?.seo
        ? row('search', 'Search listings', 'todo')
        : problems > 0
          ? row(
              'search',
              'Search listings',
              'failed',
              `${problems} problem${problems === 1 ? '' : 's'}, marked in the steps.`,
            )
          : row('search', 'Search listings', 'done'),
  ]
}

/** What `POST /api/clients/:id/claim-canonical` answered, as far as the tab reads it. */
export interface ClaimAnswer {
  status: 'claimed' | 'already' | 'needs-region' | 'needs-domains' | 'taken' | 'unknown-mount'
  message: string
}

/** What `POST /api/clients/:id/verify-embed` answered, as far as the tab reads it. */
export interface VerifyAnswer {
  status: 'verified' | 'failed' | 'inconclusive'
  message: string
  seo: SeoCheckResult[]
}

const CLAIM_TITLES: Partial<Record<ClaimAnswer['status'], string>> = {
  'needs-region': 'Set a region first',
  'needs-domains': 'This domain is not allowed',
  taken: 'Another service owns this region',
  'unknown-mount': 'Page not reported yet',
}

/**
 * What one press of a Check button found, as a banner.
 *
 * The verification answer leads when there is one, because it is about the page
 * the volunteer just worked on. A claim that went wrong leads otherwise: without
 * a claim there is often nothing to verify, and its message says why.
 */
export function checkOutcome(args: {
  /** `null` when the widget has not reported itself from this address. */
  path: string | null
  reported: boolean
  claim: ClaimAnswer | null
  verify: VerifyAnswer | null
}): BannerContent {
  const { path, reported, claim, verify } = args
  if (!reported) {
    return {
      type: 'warning',
      title: 'Not found yet',
      text: `The atlas has not shown up at ${path ?? 'this address'}. Publish the page, open it once in your browser, then check again.`,
    }
  }

  const claimTitle = claim ? CLAIM_TITLES[claim.status] : undefined

  if (verify?.status === 'verified') {
    const problems = verify.seo.filter((result) => result.status === 'fail').length
    if (claimTitle && claim) return { type: 'warning', title: claimTitle, text: claim.message }
    return problems > 0
      ? {
          type: 'warning',
          title: `Live, with ${problems} search problem${problems === 1 ? '' : 's'}`,
          text: 'Visitors are not affected. Redo the steps marked in red, then check again.',
        }
      : {
          type: 'success',
          title: 'Everything checks out',
          text: 'The atlas is live, and search engines can read it.',
        }
  }
  if (verify?.status === 'failed') {
    return { type: 'error', title: 'Could not confirm the install', text: verify.message }
  }
  if (claimTitle && claim) return { type: 'warning', title: claimTitle, text: claim.message }
  if (verify?.status === 'inconclusive') {
    return { type: 'default', title: 'Could not check right now', text: verify.message }
  }
  return {
    type: 'error',
    title: 'Could not reach the CMS',
    text: 'Nothing was changed. Try again in a moment.',
  }
}
