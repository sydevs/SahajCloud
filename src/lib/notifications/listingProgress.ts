import type { PayloadRequest } from 'payload'

import type { EventListingProgress, EventSuggestion } from '@/emails/EventVerificationEmail'
import type { EventQualityInput, EventQualityReport } from '@/lib/eventQuality'
import {
  buildEventQualityReport,
  EVENT_QUALITY_CHECK_METADATA,
  loadTitleTemplates,
} from '@/lib/eventQuality'

/**
 * A listing-quality report projected into what the reminder email shows.
 *
 * The email's counterpart to `buildPanelModel` — same registry, same
 * `detail ?? description` precedence, so a manager reading the email and a
 * manager reading the admin panel are told the same thing in the same words.
 * It differs in splitting the checks by verdict rather than ordering one list:
 * the email leads with what's left to do, closes with what's already done, and
 * the counts drive a progress bar.
 *
 * **`null` means the listing was never checked** (unpublished, finished,
 * expired, trashed) and the email says nothing at all. That is emphatically not
 * a complete listing, which comes back with `open: []` and earns the "nothing
 * to improve" note — so the two have to stay distinguishable here. (An earlier
 * cut collapsed them, correctly, back when both rendered nothing.)
 *
 * Labels are **English**: the verification email is English-only and staying
 * that way (#610 was dropped). Resolving them here rather than in the template
 * is still the right seam — the stable `key` travels with each item, so this is
 * the one function that would need a translations lookup if that ever changes.
 */
export function listingProgressFromReport(report: EventQualityReport): EventListingProgress | null {
  if (report.skipped) return null

  const open: EventSuggestion[] = []
  const done: EventListingProgress['done'] = []

  for (const result of report.checks) {
    const meta = EVENT_QUALITY_CHECK_METADATA[result.key]
    // A key with no metadata is dropped rather than shown as a bare slug —
    // same rule as the panel: `description.quality` helps no volunteer. It
    // leaves the tally too, so the bar can never count what it won't show.
    if (!meta) continue
    // `pending` is neither an achievement nor a debt, so it stays out of the
    // ratio entirely — the panel excludes it for the same reason.
    if (result.status === 'pending') continue

    if (result.status === 'failed') {
      open.push({
        key: result.key,
        label: meta.label,
        // The check's own account of what it found beats the static blurb.
        detail: result.detail ?? meta.description,
      })
    } else {
      // `passedLabel`, never `label` — a tick beside "Take the address out"
      // would read as an endorsement of leaving it in.
      done.push({ key: result.key, label: meta.passedLabel })
    }
  }

  return { open, done, resolved: done.length, total: done.length + open.length }
}

/**
 * Build the reminder email's listing progress for one event.
 *
 * Computed **fresh** from the document, never read from the stored
 * `qualityOpenCount`: that column is a query pre-filter for the list view, and
 * a bare count can neither name what to fix nor say what's already done. The
 * only query is the auto-title templates, memoized on `req` — so a whole
 * ExpireEvents sweep pays for it once.
 */
export async function buildEventListingProgress(args: {
  event: EventQualityInput
  req: PayloadRequest
  /** "Now", for judging whether a date in the copy has gone stale. */
  now?: Date
}): Promise<EventListingProgress | null> {
  const { event, req, now } = args
  const report = buildEventQualityReport(event, {
    templates: await loadTitleTemplates(req),
    now,
  })
  return listingProgressFromReport(report)
}
