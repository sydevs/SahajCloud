/**
 * What the atlas preview says it rendered for the Atlas tab's colours.
 *
 * The widget owns the correction rules, so the CMS mirrors none of them: it
 * only reads the widget's `sahaj-atlas:palette-report` and shows it.
 * ⚠ Pinned to the atlas's `startClientsPreview` and `paletteReport`
 * (sydevs/SahajAtlasWeb#392).
 */

import type { BrandColorColumn } from '@/lib/clients/appearance'

export const PALETTE_REPORT_MESSAGE = 'sahaj-atlas:palette-report'

/**
 * The checks that move the colour a visitor sees, and why, in a few words.
 *
 * ⚠ `panel-text` is left out on purpose: it corrects the panel's text step, not
 * the swatch, so a role adjusted only by it looks exactly as entered.
 */
const SWATCH_REASONS: Record<string, string> = {
  'selected-distinct': 'shifted to stand out from Primary',
  surface: 'darkened for contrast on white',
}

/** `color1`–`color3` map to the widget's brand roles. */
const ROLE_OF_COLUMN: Record<BrandColorColumn, string> = {
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
 * One colour's adjustment out of a palette report, or `null` when there is none
 * to show: another message, a swatch the widget left alone, or a report about
 * a colour other than `current`.
 *
 * ⚠ **Matched against the field's current value.** A report describes the
 * colour it was computed from, so one that arrives late, or outlives a closed
 * preview, must not label a colour it never saw.
 */
export function readAdjustment(
  data: unknown,
  column: BrandColorColumn,
  current: null | string | undefined,
): ColorAdjustment | null {
  const message = data as { roles?: Record<string, unknown>; type?: unknown } | null

  if (message?.type !== PALETTE_REPORT_MESSAGE) return null

  const report = message.roles?.[ROLE_OF_COLUMN[column]] as
    { adjustedBy?: unknown; entered?: unknown; light?: unknown; suggested?: unknown } | undefined

  if (!report || !Array.isArray(report.adjustedBy)) return null
  if (!isHex(report.light) || typeof report.entered !== 'string') return null
  if (report.entered.toLowerCase() !== current?.toLowerCase()) return null

  const checks = report.adjustedBy.filter((check) => check !== 'panel-text')

  if (checks.length === 0) return null

  return {
    light: report.light.toUpperCase(),
    // A check this CMS has no words for still counts, just without a reason.
    reasons: checks.flatMap((check) => SWATCH_REASONS[check as string] ?? []),
    suggested: isHex(report.suggested) ? report.suggested : null,
  }
}
