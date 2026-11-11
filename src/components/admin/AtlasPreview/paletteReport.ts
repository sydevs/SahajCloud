/**
 * What the atlas says it rendered, for the three colours on the Atlas tab.
 *
 * The widget owns the correction rules — no ladder is mirrored here — so the
 * only way the CMS can show a manager the colour visitors get is to ask the
 * preview and be told. The contract is sydevs/SahajAtlasWeb#389's.
 *
 * The store, its origin filter and its per-document cache are
 * `@/lib/livePreview/messageStore`, shared with the Frame editor's playhead.
 * What belongs to this tab is the vocabulary below: the checks the widget runs,
 * the sentence each explains itself with, and which field carries which role.
 */

import { createPreviewMessageStore, type DocumentKey } from '@/lib/livePreview/messageStore'

export type { DocumentKey }

/** The checks the widget runs, and the sentence each one explains itself with. */
export const ADJUSTMENT_REASONS = {
  'panel-text': 'adjusted so text stays readable',
  'selected-distinct': 'shifted so the selected class stands out',
  surface: 'darkened to stand out on white',
} as const

export type PaletteCheck = keyof typeof ADJUSTMENT_REASONS

/** One role's rendered colours, and why they are not what was entered. */
export interface RoleReport {
  adjustedBy: PaletteCheck[]
  dark: string
  entered: null | string
  light: string
  /** A seed rendering unchanged in light mode — `null` where no seed can express it. */
  suggested: null | string
}

/** `color1`/`color2`/`color3` map to these, as the widget's `BrandTheme` does. */
export type BrandRole = 'contrast' | 'primary' | 'secondary'

export const ROLE_OF_FIELD: Record<string, BrandRole> = {
  color1: 'primary',
  color2: 'secondary',
  color3: 'contrast',
}

export const PALETTE_REPORT_MESSAGE = 'sahaj-atlas:palette-report'
export const PREVIEW_MODE_MESSAGE = 'sahaj-atlas:preview-mode'

export type PaletteReport = Partial<Record<BrandRole, RoleReport>>

const store = createPreviewMessageStore<PaletteReport>({
  empty: {},
  read: (data) =>
    Object.fromEntries(
      Object.entries((data.roles ?? {}) as Record<string, RoleReport>).filter(
        ([, role]) => Array.isArray(role?.adjustedBy) && typeof role?.light === 'string',
      ),
    ) as PaletteReport,
  type: PALETTE_REPORT_MESSAGE,
})

export const { get: getCachedPaletteReport, subscribe: subscribePaletteReport } = store

/** Test-only reset hook, reached by the direct module path. */
export const __resetPaletteReportForTests = store.reset
