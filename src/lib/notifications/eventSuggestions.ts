import type { PayloadRequest } from 'payload'

import type { EventSuggestion } from '@/emails/EventVerificationEmail'
import type { EventQualityInput, EventQualityReport } from '@/lib/eventQuality'
import {
  buildEventQualityReport,
  EVENT_QUALITY_CHECK_METADATA,
  loadTitleTemplates,
} from '@/lib/eventQuality'

/**
 * The open items of a listing-quality report, resolved for the reminder email.
 *
 * The email's counterpart to `buildPanelModel` — same registry, same
 * `detail ?? description` precedence, so a manager reading the email and a
 * manager reading the admin panel are told the same thing in the same words.
 * It differs in taking only the **failures**: an email is a nudge, and a list
 * of what already passes is padding in an inbox.
 *
 * Returns `undefined` rather than `[]` for "nothing to say" — the template
 * renders nothing either way, but the distinction keeps a skipped report and a
 * clean listing from being papered over as the same thing at the call site.
 *
 * Labels are **English**: the verification email is English-only and staying
 * that way (#610 was dropped). Resolving them here rather than in the template
 * is still the right seam — the stable `key` travels with each item, so this is
 * the one function that would need a translations lookup if that ever changes.
 */
export function suggestionsFromReport(report: EventQualityReport): EventSuggestion[] | undefined {
  if (report.skipped) return undefined

  const suggestions: EventSuggestion[] = []
  for (const result of report.checks) {
    if (result.status !== 'failed') continue
    const meta = EVENT_QUALITY_CHECK_METADATA[result.key]
    // A key with no metadata is dropped rather than shown as a bare slug —
    // same rule as the panel: `description.quality` helps no volunteer.
    if (!meta) continue
    suggestions.push({
      key: result.key,
      label: meta.label,
      // The check's own account of what it found beats the static blurb.
      detail: result.detail ?? meta.description,
    })
  }

  return suggestions.length > 0 ? suggestions : undefined
}

/**
 * Build the reminder email's suggestions for one event.
 *
 * Computed **fresh** from the document, never read from the stored
 * `qualityOpenCount`: that column is a query pre-filter for the list view, and
 * a bare count can't name what to fix. The only query is the auto-title
 * templates, memoized on `req` — so a whole ExpireEvents sweep pays for it once.
 */
export async function buildEventSuggestions(args: {
  event: EventQualityInput
  req: PayloadRequest
  /** "Now", for judging whether a date in the copy has gone stale. */
  now?: Date
}): Promise<EventSuggestion[] | undefined> {
  const { event, req, now } = args
  const report = buildEventQualityReport(event, {
    templates: await loadTitleTemplates(req),
    now,
  })
  return suggestionsFromReport(report)
}
