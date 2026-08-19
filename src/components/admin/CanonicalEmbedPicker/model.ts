import { buildCanonicalUrl, canonicalTargetForHost } from '@/lib/atlas/canonicalUrl'
import type { RoutingMode } from '@/lib/clients/canonical'
import type { EmbedMetadata, EmbedMountRecord } from '@/lib/clients/embedMetadata'
import type { CanonicalVerification, VerifiedEmbed } from '@/lib/clients/verification'
import { splitMountKey } from '@/lib/clients/verification'

/**
 * Turns the two stored facts — what the widget reported, and what the CMS has
 * verified — into everything the picker renders.
 *
 * Pure, so the parts that are actually easy to get wrong (which mount is
 * selectable, what a canonical URL would look like, whether a mount can carry
 * one at all) are unit-testable without mounting React. Same split as
 * `EventQualityPanel/model.ts`.
 */

/**
 * A representative Atlas path, used only to render an example URL. Slash-led,
 * because that is what a real `webPath` is — the preview has to be the shape
 * the resolver actually emits, not a near-miss.
 */
const SAMPLE_ATLAS_PATH = '/events/12345'

export type EmbedStatus = 'verified' | 'unverified' | 'failing' | 'missing'

export interface EmbedOption {
  value: string
  label: string
  status: EmbedStatus
  lastSeen: string | null
  /** Why this mount would make a poor canonical, from the reported flags. */
  cautions: string[]
}

export interface SelectedSummary {
  value: string
  status: EmbedStatus
  routing: RoutingMode | null
  /** An example of the URL this embed yields. Null when we can't build one. */
  sampleUrl: string | null
  /** True when the sample is built from a *report*, not from a verification. */
  sampleIsProvisional: boolean
  verifiedAt: string | null
  /** "3 days ago" / "2 months ago", or null when never verified. */
  verifiedAge: string | null
  failureCount: number
  cautions: string[]
}

export interface PickerModel {
  options: EmbedOption[]
  /** Why there is nothing to pick. Null when there is. */
  emptyReason: string | null
  selected: SelectedSummary | null
}

/**
 * Reported flags that make a mount a bad canonical target.
 *
 * These are the reason the ticket insists a human designates the canonical: a
 * cross-origin iframe or a router that eats the parameter yields a URL that
 * cannot restore the view it names.
 */
export function cautionsFor(mount: EmbedMountRecord | undefined): string[] {
  if (!mount) return []
  const cautions: string[] = []
  if (!mount.topLevel) {
    cautions.push('Runs inside an iframe — a canonical URL cannot restore this view.')
  }
  if (!mount.urlWritable) {
    cautions.push('The widget cannot write this page’s URL.')
  }
  if (!mount.paramPersisted) {
    cautions.push('A written parameter does not survive a reload here.')
  }
  return cautions
}

/** Whole days, weeks or months since `iso`, phrased for a sentence. */
export function formatAge(iso: string | null | undefined, now: Date): string | null {
  if (!iso) return null
  const then = Date.parse(iso)
  if (!Number.isFinite(then)) return null

  const days = Math.floor((now.getTime() - then) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 14) return `${days} days ago`
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`
  return `${Math.floor(days / 30)} months ago`
}

function statusFor(args: {
  key: string
  reported: boolean
  verification: CanonicalVerification | null | undefined
  isSelected: boolean
}): EmbedStatus {
  const { key, reported, verification, isSelected } = args
  if (!reported) return 'missing'
  // Verification is per-client, not per-mount, so it only describes the mount
  // that is currently selected — an unselected one is simply not yet judged.
  if (!isSelected) return 'unverified'
  if (verification?.verified && mountKeyOf(verification.verified) === key) return 'verified'
  if ((verification?.failureCount ?? 0) > 0) return 'failing'
  return 'unverified'
}

/** The mount key a verified snapshot corresponds to. */
export function mountKeyOf(verified: VerifiedEmbed): string {
  return `https://${verified.domain}${verified.mount}`
}

export { splitMountKey }

export function buildPickerModel(args: {
  embedMetadata: EmbedMetadata | null | undefined
  embed: string | null | undefined
  verification: CanonicalVerification | null | undefined
  now: Date
}): PickerModel {
  const { embedMetadata, embed, verification, now } = args
  const reported = embedMetadata ?? {}
  const keys = Object.keys(reported).sort()

  const options: EmbedOption[] = keys.map((key) => ({
    value: key,
    label: key,
    status: statusFor({ key, reported: true, verification, isSelected: key === embed }),
    lastSeen: reported[key]?.lastSeen ?? null,
    cautions: cautionsFor(reported[key]),
  }))

  // A selection that has fallen out of the report set still has to be shown —
  // silently dropping it would hide exactly the situation the operator needs to
  // act on (the page moved, or the widget came off the site).
  if (embed && !keys.includes(embed)) {
    options.unshift({
      value: embed,
      label: `${embed} (no longer reported)`,
      status: 'missing',
      lastSeen: null,
      cautions: ['This page has stopped reporting an embed.'],
    })
  }

  const emptyReason =
    keys.length === 0
      ? 'No embeds reported yet. This service’s site needs the current Sahaj Atlas widget ' +
        'installed; it reports itself the first time someone loads the page.'
      : null

  return { options, emptyReason, selected: summarise({ embed, reported, verification, now }) }
}

function summarise(args: {
  embed: string | null | undefined
  reported: EmbedMetadata
  verification: CanonicalVerification | null | undefined
  now: Date
}): SelectedSummary | null {
  const { embed, reported, verification, now } = args
  if (!embed) return null

  const mount = reported[embed]
  const verified = verification?.verified ?? null
  const isVerifiedForThisEmbed = verified != null && mountKeyOf(verified) === embed

  // Prefer the verified snapshot — it is what a canonical URL is actually built
  // from. Fall back to the report so an operator can still see the shape of what
  // they are choosing, clearly marked as not yet confirmed.
  let sampleUrl: string | null = null
  let sampleIsProvisional = false
  let routing: RoutingMode | null = null

  // A null target means the host can't make a canonical URL at all (not a bare
  // host — most likely a mount carrying a port). `sampleUrl` stays null, which
  // the picker already renders as "no example", and that is the truth: the
  // resolver would refuse this embed too.
  if (isVerifiedForThisEmbed && verified) {
    routing = verified.routing
    const target = canonicalTargetForHost(verified)
    sampleUrl = target && buildCanonicalUrl(target, SAMPLE_ATLAS_PATH)
  } else if (mount) {
    const split = splitMountKey(embed)
    if (split) {
      routing = mount.routing
      sampleIsProvisional = true
      const target = canonicalTargetForHost({ ...split, routing: mount.routing })
      sampleUrl = target && buildCanonicalUrl(target, SAMPLE_ATLAS_PATH)
    }
  }

  return {
    value: embed,
    status: statusFor({ key: embed, reported: Boolean(mount), verification, isSelected: true }),
    routing,
    sampleUrl,
    sampleIsProvisional,
    verifiedAt: isVerifiedForThisEmbed ? (verified?.at ?? null) : null,
    verifiedAge: isVerifiedForThisEmbed ? formatAge(verified?.at, now) : null,
    failureCount: verification?.failureCount ?? 0,
    cautions: cautionsFor(mount),
  }
}
