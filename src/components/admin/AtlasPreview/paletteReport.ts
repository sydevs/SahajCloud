/**
 * What the atlas preview says it rendered for the Atlas tab's colours.
 *
 * The widget owns the correction rules, so the CMS mirrors none of them: it
 * only reads the widget's `sahaj-atlas:palette-report` and shows it.
 * ⚠ Pinned to the atlas's `startClientsPreview` and `paletteReport`
 * (sydevs/SahajAtlasWeb#392).
 */

import { ATLAS_DEFAULT_COLORS, isBrandColor, type BrandColorColumn } from '@/lib/clients/appearance'

export const PALETTE_REPORT_MESSAGE = 'sahaj-atlas:palette-report'

/**
 * The checks that move the colour a visitor sees, and why, in a few words.
 *
 * ⚠ `panel-text` is left out on purpose: it corrects the panel's text step, not
 * the swatch, so a role adjusted only by it looks exactly as entered.
 */
const SWATCH_REASONS: Record<string, string> = {
  'near-white': 'moved away from near-white',
  'selected-distinct': 'shifted to stand out from Primary',
  surface: 'adjusted for contrast with the background',
}

/** `color1`–`color3` map to the widget's brand roles. */
const ROLE_OF_COLUMN: Record<BrandColorColumn, string> = {
  color1: 'primary',
  color2: 'secondary',
  color3: 'contrast',
}

export interface Swatch {
  /** Whether the widget moved this colour's swatch in either mode, and in each. */
  adjusted: boolean
  darkAdjusted: boolean
  lightAdjusted: boolean
  /** The solid visitors see in each mode. */
  dark: string
  light: string
  reasons: string[]
  /** A seed that renders unchanged — `null` where none is needed or none can express it. */
  suggested: null | string
}

const isHex = (value: unknown): value is string =>
  typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)

/**
 * What visitors see for one colour, out of a palette report, or `null` when the
 * report cannot say: another message, or a report about a colour other than
 * `current`.
 *
 * An unset colour is the Atlas default, which the widget reports nothing about,
 * so it is shown as that default and never as adjusted.
 *
 * ⚠ **Matched against the field's current value.** A report describes the
 * colour it was computed from, so one that arrives late, or outlives a closed
 * preview, must not label a colour it never saw.
 */
export function readSwatch(
  data: unknown,
  column: BrandColorColumn,
  current: null | string | undefined,
): null | Swatch {
  const message = data as { roles?: Record<string, unknown>; type?: unknown } | null

  if (message?.type !== PALETTE_REPORT_MESSAGE) return null

  if (!isBrandColor(current)) {
    const fallback = ATLAS_DEFAULT_COLORS[column].toUpperCase()

    return {
      adjusted: false,
      dark: fallback,
      darkAdjusted: false,
      lightAdjusted: false,
      light: fallback,
      reasons: [],
      suggested: null,
    }
  }

  const report = message.roles?.[ROLE_OF_COLUMN[column]] as
    | {
        dark?: unknown
        darkAdjustedBy?: unknown
        entered?: unknown
        light?: unknown
        lightAdjustedBy?: unknown
        suggested?: unknown
      }
    | undefined

  if (!report || !Array.isArray(report.lightAdjustedBy) || !Array.isArray(report.darkAdjustedBy)) {
    return null
  }
  if (!isHex(report.light) || !isHex(report.dark) || typeof report.entered !== 'string') return null
  if (report.entered.toLowerCase() !== current.toLowerCase()) return null

  const light = swatchChecks(report.lightAdjustedBy)
  const dark = swatchChecks(report.darkAdjustedBy)
  const checks = [...new Set([...light, ...dark])]
  const adjusted = checks.length > 0

  return {
    adjusted,
    dark: report.dark.toUpperCase(),
    darkAdjusted: dark.length > 0,
    lightAdjusted: light.length > 0,
    light: report.light.toUpperCase(),
    // A check this CMS has no words for still counts, just without a reason.
    reasons: checks.flatMap((check) => SWATCH_REASONS[check as string] ?? []),
    suggested: adjusted && isHex(report.suggested) ? report.suggested : null,
  }
}

const swatchChecks = (checks: unknown[]): string[] =>
  checks.filter((check): check is string => typeof check === 'string' && check !== 'panel-text')
