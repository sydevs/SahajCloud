import type { CheckStatus, EventQualityReport, QualitySkipReason } from '@/lib/eventQuality/types'

/** Metadata threaded through `admin.custom` from the check registry. */
export type ChecksMetadata = Record<
  string,
  { label: string; passedLabel: string; description: string }
>

export type PanelItem = {
  key: string
  /** Already resolved for status — what the panel prints. */
  label: string
  /** One passage; the panel shows it only under an open recommendation. */
  description: string
  status: CheckStatus
}

export type PanelModel =
  | { skipped: true; reason: QualitySkipReason }
  | {
      skipped: false
      /**
       * One flat, ordered list: open findings first, then what already passes.
       * Four checks doesn't warrant grouping, and the passing ones read as a
       * quiet confirmation directly under the work still to do.
       */
      items: PanelItem[]
      /** Checks that passed, out of those with a verdict (pending excluded). */
      resolved: number
      total: number
      openCount: number
      pendingCount: number
    }

/** Open findings first, then pending, then what already passes. */
const STATUS_ORDER: Record<CheckStatus, number> = { failed: 0, pending: 1, passed: 2 }

/**
 * Flatten a report plus its check metadata into what the panel renders.
 *
 * Pure and separate from the component so the ordering and counting are
 * unit-testable without mounting React.
 *
 * A key with no metadata is dropped rather than rendered as a bare slug: the
 * registry is the source of both, so a mismatch means a stale cached report,
 * and showing `description.quality` to a volunteer manager helps nobody.
 */
export function buildPanelModel(
  report: EventQualityReport | null | undefined,
  checksMetadata: ChecksMetadata,
): PanelModel | null {
  if (!report) return null
  if (report.skipped) return { skipped: true, reason: report.reason }

  const items: PanelItem[] = []
  for (const result of report.checks) {
    const meta = checksMetadata[result.key]
    if (!meta) continue
    items.push({
      key: result.key,
      status: result.status,
      label: result.status === 'passed' ? meta.passedLabel : meta.label,
      // The check's own account of what it found beats the static blurb.
      description: result.detail ?? meta.description,
    })
  }

  const ordered = [...items].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
  const openCount = items.filter((item) => item.status === 'failed').length
  const pendingCount = items.filter((item) => item.status === 'pending').length
  // Pending items are excluded from the ratio entirely — something that cannot
  // exist yet is neither an achievement nor a debt.
  const total = items.length - pendingCount

  return {
    skipped: false,
    items: ordered,
    resolved: total - openCount,
    total,
    openCount,
    pendingCount,
  }
}
