import type { Step, StepId, Track, TrackMeta } from './steps'

import type { EmbedMetadata } from '@/lib/clients/embedMetadata'
import { normalizeMountPath, siteHosts } from '@/lib/clients/site'
import type { CanonicalVerification, SeoCheckResult } from '@/lib/clients/verification'
import { splitMountKey } from '@/lib/clients/verification'
import type { Client } from '@/payload-types'

import { PLATFORM_LABELS, stepForCheck, TRACK_META } from './steps'

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
  /** The `origin + pathname` key `embedMetadata` is keyed by. */
  key: string
  host: string
  mount: string
  lastSeen?: string
}

/**
 * The reported mounts whose page is the address being installed.
 *
 * Matched on the path, and on the host when one is known: a service is one site,
 * served at its domain or that domain's www twin (`siteHosts`), and the browser
 * reports whichever the visitor typed. The one chosen is the most recently seen
 * — which is the live one.
 *
 * A WordPress permalink mount (`/?p=42`) is compared with its query intact,
 * because that query *is* the page there.
 */
export function reportedMountsFor(args: {
  embedMetadata: EmbedMetadata | null | undefined
  /** `null` while the address has a problem, which matches nothing. */
  atlasUrl: string | null
  /** The service's domain, which narrows the match to its own site. */
  host?: string | null
}): ReportedMount[] {
  const { embedMetadata, atlasUrl } = args
  if (atlasUrl === null || !embedMetadata || typeof embedMetadata !== 'object') return []

  const wanted = normalizeMountPath(atlasUrl)
  const hosts = siteHosts(args.host)
  const mounts: ReportedMount[] = []

  for (const [key, record] of Object.entries(embedMetadata)) {
    const split = splitMountKey(key)
    if (!split || normalizeMountPath(split.mount) !== wanted) continue
    if (hosts.length > 0 && !hosts.includes(split.domain.split(':')[0].toLowerCase())) continue
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

/** How far along the install is. One answer, for the banner at the top. */
export type InstallStage = 'waiting' | 'seen' | 'verifying' | 'verified' | 'warnings' | 'failed'

/**
 * What one step's light says, and why.
 *
 * `done` is inferred, never checked: a step nothing can observe, sitting before
 * one in the same section that passed. Every step is done in order, so a later
 * step confirmed is evidence the earlier ones were too.
 */
export interface StepStatus {
  state: 'pass' | 'fail' | 'unknown' | 'done'
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
  /** The service's domain, which narrows the reports to its own site. */
  host?: string | null
}): InstallModel {
  const { embedMetadata, verification, atlasUrl, track, busy = false } = args

  const reported = reportedMountsFor({ embedMetadata, atlasUrl, host: args.host })
  const candidate = reported[0] ?? null
  // A track with no search listings ignores the checks the CMS runs regardless.
  const results = track?.searchListings === false ? [] : (verification?.seo?.results ?? [])
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
    const where = result.route === '/' ? 'your atlas page' : `the page for ${result.route}`
    note(
      step,
      result.status === 'pass' ? 'pass' : 'fail',
      result.status === 'fail'
        ? `On ${where}: ${result.detail ?? 'this does not match what Sahaj Atlas expects.'}`
        : undefined,
    )
  }

  const routingStep = track?.checks.routing
  if (routingStep && candidate) {
    const routing = routingOutcome({ embedMetadata, verification, candidate })
    if (routing === 'pass') note(routingStep, 'pass')
    if (routing === 'fail') {
      note(
        routingStep,
        'fail',
        `Opening an address under ${candidate.mount}, such as ${candidate.mount.replace(/\/$/, '')}/ca/ontario, does not show the atlas yet.`,
      )
    }
  }

  // Section 3 only: its steps are done in order. The follow-on steps are not,
  // so one passing there says nothing about another.
  if (track) inferEarlierSteps(stepStatus, track.steps)

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

/**
 * Whether every class has an address of its own on the page being installed.
 *
 * Two observations, one per half of the step: the widget's report says the
 * snippet asks for `routing=path`, and the routing probe found the server
 * answering a made-up address under the page. The probe is of the canonical
 * mount, so it says nothing about any other page.
 *
 * ⚠ **A negative probe fails the step only once it is newer than the report.**
 * A snippet swapped since the last check reads `path` beside a probe taken
 * before the server was set up, which is not yet a failure.
 */
function routingOutcome(args: {
  embedMetadata: EmbedMetadata | null | undefined
  verification: CanonicalVerification | null | undefined
  candidate: ReportedMount
}): 'pass' | 'fail' | 'unknown' {
  const { embedMetadata, verification, candidate } = args
  const asked = embedMetadata?.[candidate.key]?.routing
  const probe = verification?.routingProbe
  const verifiedMount = verification?.verified?.mount
  if (asked !== 'path' || !probe || verifiedMount === undefined) return 'unknown'
  if (normalizeMountPath(verifiedMount) !== normalizeMountPath(candidate.mount)) return 'unknown'
  if (probe.verdict === 'path') return 'pass'
  const probedSince = candidate.lastSeen === undefined || probe.at > candidate.lastSeen
  return probe.failedAttempts > 0 && probedSince ? 'fail' : 'unknown'
}

/**
 * Mark each step with no result of its own as done when a later step in the
 * same section passed.
 *
 * ⚠ **A failure is never inferred over.** A step that failed keeps its red light
 * whatever passed after it, and a step after the last pass stays unmarked — it
 * may not have been reached yet.
 */
function inferEarlierSteps(stepStatus: Partial<Record<StepId, StepStatus>>, steps: Step[]): void {
  let laterPassed = false
  for (const step of [...steps].reverse()) {
    const state = stepStatus[step.id]?.state
    if (state === 'pass') laterPassed = true
    else if (laterPassed && (state === undefined || state === 'unknown')) {
      stepStatus[step.id] = { state: 'done', messages: [] }
    }
  }
}

/** A banner the tab shows: its colour, its title, and one or two sentences. */
export interface BannerContent {
  type: 'default' | 'error' | 'success' | 'warning'
  title: string
  text: string
}

/** The banner at the top of the tab, per stage. */
const STAGE_BANNERS: Record<InstallStage, BannerContent> = {
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
    text: 'Your atlas works for visitors, but search engines cannot read part of it. Redo the steps marked in red.',
  },
  failed: {
    type: 'error',
    title: 'Could not confirm the install',
    text: 'Your page reported the atlas, but we could not open the page ourselves. See the step marked in red.',
  },
}

/** The top banner for a stage, worded for a track with no search listings where that differs. */
export function stageBanner(stage: InstallStage, searchListings: boolean): BannerContent {
  const banner = STAGE_BANNERS[stage]
  return stage === 'verified' && !searchListings
    ? { ...banner, text: 'Visitors can find classes on your site.' }
    : banner
}

/**
 * How one row of the progress table stands.
 *
 * `na` is a row the chosen track can never finish. It is shown, so the volunteer
 * sees what the track gives up, and left out of the count, so the count can
 * still reach the end.
 */
export type MilestoneState = 'done' | 'failed' | 'todo' | 'na'

export interface Milestone {
  id: 'seen' | 'confirmed' | 'region' | 'routing' | 'search'
  label: string
  state: MilestoneState
  /**
   * One of {@link MILESTONE_STATUS}, "Checking…" while a check runs, or "Not
   * available for <kind of site>" for a row the site can never finish.
   */
  status: string
  /** A second line under the label, where there is something specific to say. */
  note?: string
}

/** The Status column's whole vocabulary, so every row reads the same way. */
export const MILESTONE_STATUS: Record<MilestoneState, string> = {
  done: 'Done',
  todo: 'Not yet',
  failed: 'Needs fixing',
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
 * ⚠ **A row the track can never finish is `na`**: shown, and out of the count.
 * An iframe has neither class addresses nor search listings; a Squarespace page
 * has addresses, as `?atlas=` links, but no listings (`Track.classAddresses`,
 * `Track.searchListings`).
 *
 * **Class addresses are done in either shape.** A `?atlas=` link is an address a
 * visitor can share and land on; serving `/classes/ca/ontario` as well is what
 * search listings need, and that row says so.
 */
export function buildMilestones(args: {
  model: InstallModel
  verification: CanonicalVerification | null | undefined
  /** Whether this service's site is the home for its region's links (`canonical.owned`). */
  owned: boolean
  /** `null` until one is chosen. Its platform names a Not available status — "Iframe only". */
  track: TrackMeta | null
  /** The service's region, named in the Region claimed note; `null` is Worldwide. */
  regionName: string | null
  /** The host the volunteer typed, for the notes, until a canonical embed names one. */
  host?: string | null
}): Milestone[] {
  const { model, verification, owned, regionName, track } = args
  const searchListings = track?.searchListings !== false
  const classAddresses = track?.classAddresses !== false
  const siteKind = track ? PLATFORM_LABELS[track.platform] : undefined
  const [first, ...rest] = model.reported
  const site = verification?.verified?.domain ?? args.host ?? first?.host ?? 'your site'
  const problems = model.failures.length
  const row = (
    id: Milestone['id'],
    label: string,
    state: MilestoneState,
    note?: string,
    /** What a `na` row is not available for, when it is not the kind of site. */
    naFor?: string,
  ): Milestone => ({
    id,
    label,
    state,
    status:
      state === 'na' && (naFor ?? siteKind)
        ? `${MILESTONE_STATUS.na} for ${naFor ?? siteKind}`
        : MILESTONE_STATUS[state],
    ...(note ? { note } : {}),
  })

  const confirmed: Milestone = verification?.verified
    ? row('confirmed', 'Install confirmed', 'done')
    : model.stage === 'failed'
      ? row('confirmed', 'Install confirmed', 'failed', 'We could not open your page')
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
    owned
      ? row(
          'region',
          'Region claimed',
          'done',
          `Atlas links for ${regionName ?? 'regions without a site of their own'} lead to ${site}`,
        )
      : !classAddresses
        ? row('region', 'Region claimed', 'na', 'Only a page that gives each class its own link')
        : regionName === null
          ? row(
              'region',
              'Region claimed',
              'na',
              'Your map shows the whole world',
              'a worldwide map',
            )
          : row(
              'region',
              'Region claimed',
              'todo',
              `Atlas links for ${regionName} will lead to ${site}`,
            ),
    !classAddresses
      ? row('routing', 'Class addresses', 'na', 'An iframe cannot change your page’s address')
      : probe
        ? row(
            'routing',
            'Class addresses',
            'done',
            `Each class has its own shareable link on ${site}`,
          )
        : row('routing', 'Class addresses', 'todo'),
    !searchListings
      ? row('search', 'Search listings', 'na', 'Search engines see one page, not each class')
      : !verification?.seo
        ? row('search', 'Search listings', 'todo')
        : problems > 0
          ? row(
              'search',
              'Search listings',
              'failed',
              `${problems} problem${problems === 1 ? '' : 's'}, marked in the steps`,
            )
          : row(
              'search',
              'Search listings',
              'done',
              `Google can read information about your classes on ${site}`,
            ),
  ]
}

/**
 * The same milestones from a service's stored record alone, with no tab open.
 *
 * For the two surfaces that show how far an install has got without being the
 * Install tab — the banner above the edit view and the Atlas tab's summary — so
 * all three count the same milestones the same way. Everything the tab adds on
 * top (an address still being typed, a check in flight) is this visit's, and
 * not here.
 */
export function milestonesForRecord(args: {
  site: Client['site'] | null | undefined
  embedMetadata: EmbedMetadata | null | undefined
  verification: CanonicalVerification | null | undefined
  owned: boolean
  /** `null` for a worldwide map. */
  regionName: string | null
}): Milestone[] {
  const { site, embedMetadata, verification, owned, regionName } = args
  // No steps to mark: the milestones read the reports, the stage and — only on
  // a track with search listings — the failures, none of which needs the track.
  const model = buildInstallModel({
    embedMetadata,
    verification,
    atlasUrl: site?.page ?? null,
    track: null,
    host: site?.domain,
  })
  return buildMilestones({
    model,
    verification,
    owned,
    track: site?.track ? TRACK_META[site.track] : null,
    regionName,
    host: site?.domain,
  })
}

/** How many of the milestones a site can reach are done. A `na` row is in neither count. */
export function installProgress(milestones: Milestone[]): { done: number; total: number } {
  const counted = milestones.filter((milestone) => milestone.state !== 'na')
  return {
    done: counted.filter((milestone) => milestone.state === 'done').length,
    total: counted.length,
  }
}

/** Whether every milestone a site can reach is done — the "Installation complete" of the Install tab. */
export function installComplete(milestones: Milestone[]): boolean {
  const { done, total } = installProgress(milestones)
  return done === total
}

/** What `POST /api/clients/:id/claim-canonical` answered, as far as the tab reads it. */
export interface ClaimAnswer {
  status:
    | 'claimed'
    | 'already'
    | 'worldwide'
    | 'no-class-addresses'
    | 'taken'
    | 'unknown-mount'
    | 'no-page'
  message: string
}

/** What `POST /api/clients/:id/verify-embed` answered, as far as the tab reads it. */
export interface VerifyAnswer {
  status: 'verified' | 'failed' | 'inconclusive'
  message: string
  seo: SeoCheckResult[]
}

/**
 * The claim answers worth a banner of their own. `worldwide` and
 * `no-class-addresses` are not here: neither is something to fix, and the status
 * table already says what each means.
 */
const CLAIM_TITLES: Partial<Record<ClaimAnswer['status'], string>> = {
  taken: 'Another site already has this region',
  'unknown-mount': 'We have not seen this page yet',
  'no-page': 'Add your atlas address first',
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
  /** `false` for a track whose search checks say nothing (`Track.searchListings`). */
  searchListings?: boolean
}): BannerContent {
  const { path, reported, claim, verify, searchListings = true } = args
  if (!reported) {
    return {
      type: 'warning',
      title: 'Not found yet',
      text: `We have not seen the atlas at ${path ?? 'this address'} yet. Publish the page, open it once in your browser, then check again.`,
    }
  }

  const claimTitle = claim ? CLAIM_TITLES[claim.status] : undefined

  if (verify?.status === 'verified') {
    const problems = searchListings
      ? verify.seo.filter((result) => result.status === 'fail').length
      : 0
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
          text: searchListings
            ? 'The atlas is live, and search engines can read it.'
            : 'The atlas is live on your site.',
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
    title: 'Could not run the check',
    text: 'Nothing was changed. Try again in a moment.',
  }
}

/**
 * Whether every step in a section is confirmed, or implied by one that is.
 *
 * A section's Check button has nothing left to find once this holds, so the
 * section drops it; the sidebar's Check again stays for a volunteer who changed
 * something anyway.
 */
export function sectionConfirmed(
  steps: Step[],
  stepStatus: Partial<Record<StepId, StepStatus>>,
): boolean {
  return steps.every((step) => {
    const state = stepStatus[step.id]?.state
    return state === 'pass' || state === 'done'
  })
}
