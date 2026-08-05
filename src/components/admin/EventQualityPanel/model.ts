import type {
  CheckStatus,
  EventQualityReport,
  QualitySkipReason,
  QualityTier,
} from '@/lib/eventQuality/types'
import { QUALITY_TIERS } from '@/lib/eventQuality/types'

/** Metadata threaded through `admin.custom` from the check registry. */
export type ChecksMetadata = Record<
  string,
  {
    label: string
    passedLabel: string
    localeLabel?: string
    localePassedLabel?: string
    description: string
    tier: QualityTier
  }
>

export type PanelItem = {
  key: string
  /** Already resolved for status and language — what the panel prints. */
  label: string
  /** One short sentence; the panel shows it only under an open recommendation. */
  description: string
  tier: QualityTier
  status: CheckStatus
  /**
   * The language to bold inside `label`, set only when naming it earns its
   * place — i.e. the event is judged in more than one. `label` then contains a
   * `%{language}` placeholder marking where it goes.
   */
  language?: string
}

export type PanelGroup = {
  tier: QualityTier
  label: string
  items: PanelItem[]
}

export type PanelModel =
  | { skipped: true; reason: QualitySkipReason }
  | {
      skipped: false
      groups: PanelGroup[]
      /** Checks that passed, out of those with a verdict (pending excluded). */
      resolved: number
      total: number
      openCount: number
      pendingCount: number
    }

/** "de" → "German". Falls back to the raw code where Intl has no name. */
function languageName(locale: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(locale) ?? locale
  } catch {
    return locale
  }
}

const TIER_LABELS: Record<QualityTier, string> = {
  completeness: 'Completeness',
  title: 'Title',
  description: 'Description',
  translation: 'Translations',
}

/** Open findings first, then pending, then what already passes. */
const STATUS_ORDER: Record<CheckStatus, number> = { failed: 0, pending: 1, passed: 2 }

/**
 * Flatten a report plus its check metadata into what the panel renders.
 *
 * Pure and separate from the component so the grouping, ordering and counting
 * are unit-testable without mounting React.
 *
 * A key with no metadata is dropped rather than rendered as a bare slug: the
 * registry is the source of both, so a mismatch means a stale cached report,
 * and showing `description.tooShort` to a volunteer manager helps nobody.
 */
export function buildPanelModel(
  report: EventQualityReport | null | undefined,
  checksMetadata: ChecksMetadata,
): PanelModel | null {
  if (!report) return null
  if (report.skipped) return { skipped: true, reason: report.reason }

  // One language is the overwhelmingly common case, and naming it on every row
  // ("Add a title in English" on an English-only event) is noise. Only when an
  // event is genuinely multilingual does the language carry information.
  const namesLanguages = report.locales.length > 1

  const items: PanelItem[] = []
  for (const result of report.document) {
    const meta = checksMetadata[result.key]
    if (!meta) continue
    items.push({
      key: result.key,
      tier: meta.tier,
      status: result.status,
      label: result.status === 'passed' ? meta.passedLabel : meta.label,
      // The check's own account of what it found beats the static blurb.
      description: result.detail ?? meta.description,
    })
  }
  for (const locale of report.locales) {
    for (const result of report.perLocale[locale] ?? []) {
      const meta = checksMetadata[result.key]
      if (!meta) continue
      const passed = result.status === 'passed'
      const plain = passed ? meta.passedLabel : meta.label
      const named = passed ? meta.localePassedLabel : meta.localeLabel
      items.push({
        key: result.key,
        tier: meta.tier,
        status: result.status,
        label: namesLanguages && named ? named : plain,
        description: result.detail ?? meta.description,
        ...(namesLanguages && named ? { language: languageName(locale) } : {}),
      })
    }
  }

  const groups = QUALITY_TIERS.map((tier) => ({
    tier,
    label: TIER_LABELS[tier],
    items: items
      .filter((item) => item.tier === tier)
      .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]),
  })).filter((group) => group.items.length > 0)

  const openCount = items.filter((item) => item.status === 'failed').length
  const pendingCount = items.filter((item) => item.status === 'pending').length
  // Pending items are excluded from the ratio entirely — a translation that
  // cannot exist yet is neither an achievement nor a debt.
  const total = items.length - pendingCount

  return {
    skipped: false,
    groups,
    resolved: total - openCount,
    total,
    openCount,
    pendingCount,
  }
}
