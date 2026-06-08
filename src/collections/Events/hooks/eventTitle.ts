import type { FieldHook, PayloadRequest } from 'payload'

/** Fallback prefix used when the translations global has no value for the locale. */
export const DEFAULT_EVENT_TITLE_PREFIX = 'Meditation at'

/**
 * The venue/building or street name for an auto-title: the first comma-segment
 * of the street address (e.g. "Beethovenstraße 12, 2nd floor" → "Beethovenstraße 12").
 */
export function firstAddressSegment(street: unknown): string {
  if (typeof street !== 'string') return ''
  return street.split(',')[0]?.trim() ?? ''
}

/**
 * Compose an event's auto-title as "<prefix> <venue>". Returns null when there
 * is no usable street/venue, so the title stays empty and `useAsTitle` falls
 * back to the document id.
 */
export function composeEventTitle(prefix: string, street: unknown): string | null {
  const venue = firstAddressSegment(street)
  if (!venue) return null
  const trimmedPrefix = prefix.trim()
  return trimmedPrefix ? `${trimmedPrefix} ${venue}` : venue
}

/** Read the localized title prefix from the Sahaj Atlas translations global. */
async function resolveTitlePrefix(req: PayloadRequest): Promise<string> {
  try {
    const translations = await req.payload.findGlobal({
      slug: 'sy-atlas-translations',
      locale: req.locale,
      depth: 0,
      req,
    })
    const prefix = (translations as { event?: { titlePrefix?: unknown } }).event?.titlePrefix
    return typeof prefix === 'string' && prefix.trim() ? prefix : DEFAULT_EVENT_TITLE_PREFIX
  } catch (error) {
    req.payload.logger.debug({
      msg: 'Failed to read sy-atlas-translations event.titlePrefix; using default',
      error,
    })
    return DEFAULT_EVENT_TITLE_PREFIX
  }
}

/**
 * beforeChange hook for the Events `title` field. An explicit title (newly
 * entered, or carried over on a partial update) is kept as-is; an empty title
 * is auto-filled with "<localized prefix> <venue>" from the first segment of
 * the event's street address. `title` is localized, so this computes per
 * save-locale; clearing the field re-triggers the auto-fill.
 */
export const eventTitleBeforeChange: FieldHook = async ({ value, data, originalDoc, req }) => {
  const incoming = typeof value === 'string' ? value : undefined
  const existing = typeof originalDoc?.title === 'string' ? originalDoc.title : undefined
  // `incoming ?? existing` keeps an existing title on a partial update (value
  // undefined) but lets an explicit clear (value '') fall through to auto-fill.
  const current = incoming ?? existing
  if (current && current.trim()) return current

  const address = (data?.address ?? originalDoc?.address) as { street?: unknown } | undefined
  // No usable street → leave the title empty (useAsTitle falls back to the id).
  if (!firstAddressSegment(address?.street)) return value

  // The guard above guarantees a usable venue, so composeEventTitle returns a
  // non-null string here.
  return composeEventTitle(await resolveTitlePrefix(req), address?.street)
}
