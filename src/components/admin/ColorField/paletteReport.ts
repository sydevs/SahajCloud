/**
 * What the atlas preview says it rendered for one of the Atlas tab's colours.
 *
 * The widget owns the correction rules, so the CMS mirrors none of them: it
 * only reads the widget's `sahaj-atlas:palette-report` and shows it.
 * ⚠ Pinned to the atlas's `startClientsPreview` and `paletteReport`
 * (sydevs/SahajAtlasWeb#392).
 */

export const PALETTE_REPORT_MESSAGE = 'sahaj-atlas:palette-report'

/** The checks the widget runs, and the sentence each one explains itself with. */
const ADJUSTMENT_REASONS: Record<string, string> = {
  'panel-text': 'adjusted so text stays readable',
  'selected-distinct': 'shifted so the selected class stands out',
  surface: 'darkened to stand out on white',
}

/** `color1`–`color3` map to the widget's brand roles. */
const ROLE_OF_FIELD: Record<string, string> = {
  color1: 'primary',
  color2: 'secondary',
  color3: 'contrast',
}

export interface ColorAdjustment {
  /** The solid visitors see, in light mode. */
  light: string
  reasons: string[]
  /** A seed that renders unchanged — `null` where no seed can express the correction. */
  suggested: null | string
}

const isHex = (value: unknown): value is string =>
  typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)

/**
 * This field's adjustment out of a palette report, or `null` when there is none
 * to show: another message, an unknown field, an unadjusted role, or a report
 * about a colour other than `current`.
 *
 * ⚠ **Matched against the field's current value.** A report describes the
 * colour it was computed from, so one that arrives late, or outlives a closed
 * preview, must not label a colour it never saw.
 */
export function readAdjustment(
  data: unknown,
  fieldName: string,
  current: null | string | undefined,
): ColorAdjustment | null {
  const message = data as { roles?: Record<string, unknown>; type?: unknown } | null
  const role = ROLE_OF_FIELD[fieldName]

  if (message?.type !== PALETTE_REPORT_MESSAGE || !role) return null

  const report = message.roles?.[role] as
    { adjustedBy?: unknown; entered?: unknown; light?: unknown; suggested?: unknown } | undefined

  if (!report || !Array.isArray(report.adjustedBy) || report.adjustedBy.length === 0) return null
  if (!isHex(report.light) || typeof report.entered !== 'string') return null
  if (report.entered.toLowerCase() !== current?.toLowerCase()) return null

  return {
    light: report.light.toUpperCase(),
    // A check this CMS has no sentence for still shows the note, just without a reason.
    reasons: report.adjustedBy.flatMap((check) => ADJUSTMENT_REASONS[check as string] ?? []),
    // ⚠ The button follows `suggested`, never `adjustedBy`: a `panel-text`-only
    // correction moves a ladder step no seed can express, and reports `null`.
    suggested: isHex(report.suggested) ? report.suggested : null,
  }
}
