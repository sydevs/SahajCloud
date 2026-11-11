/**
 * What the atlas says it rendered, for the three colours on the Atlas tab.
 *
 * The widget owns the correction rules — no ladder is mirrored here — so the
 * only way the CMS can show a manager the colour visitors get is to ask the
 * preview and be told. The contract is sydevs/SahajAtlasWeb#389's.
 *
 * ⚠ **A subscriber names the origin it will hear from, and hears from no other**
 * — the pattern `playbackTimeStore` sets, and for the same reason: a message
 * accepted from any origin lets any page able to reach this window decide what
 * a manager is told their colours look like.
 *
 * Module-level rather than per-component because the three `ColorField`s are
 * siblings and one message answers all of them, and because a remount must not
 * blank a note that is still true.
 *
 * ⚠ **The cache is keyed by document**, and a message carries no id — the
 * subscriber supplies its own. Without that key, opening service B after service A
 * would show A's rendered colours under B's pickers, and offer a button writing
 * A's colour into B.
 */

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

/** Which document a report describes — a `clients` row id, as the admin route names it. */
export type DocumentKey = number | string

type Subscription = { cb: (report: PaletteReport) => void; document: DocumentKey; origin: string }

let cached: { document: DocumentKey; report: PaletteReport } | null = null
const subscriptions = new Set<Subscription>()
let listenerAttached = false

const handleMessage = (event: MessageEvent): void => {
  if (event.data?.type !== PALETTE_REPORT_MESSAGE) return

  const listening = [...subscriptions].filter((entry) => entry.origin === event.origin)
  if (listening.length === 0) return

  const report = (event.data.roles ?? {}) as PaletteReport

  cached = { document: listening[0]!.document, report }
  listening.forEach((entry) => entry.cb(report))
}

/** The last report for `document`, or nothing — never another service's. */
export const getCachedPaletteReport = (document: DocumentKey): PaletteReport =>
  cached?.document === document ? cached.report : {}

/** Listen for the atlas's report, from `origin` alone. Re-subscribe when it changes. */
export function subscribePaletteReport(
  cb: (report: PaletteReport) => void,
  origin: string,
  document: DocumentKey,
): () => void {
  if (!listenerAttached && typeof window !== 'undefined') {
    listenerAttached = true
    window.addEventListener('message', handleMessage)
  }

  const entry: Subscription = { cb, document, origin }
  subscriptions.add(entry)

  return () => {
    subscriptions.delete(entry)
  }
}
