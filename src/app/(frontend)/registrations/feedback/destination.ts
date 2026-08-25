/**
 * Where the feedback page sends a reader once their answer is recorded.
 *
 * Lives beside its only consumer rather than in `lib/registrations`: the
 * token helpers there are genuinely shared (the follow-up job *signs*, this
 * page *verifies*), but this decision is the page's alone.
 */

/** A doc's public `webUrl`, when it's populated and actually has one. */
function webUrlOf(doc: unknown): string | null {
  if (!doc || typeof doc !== 'object') return null
  const url = (doc as { webUrl?: unknown }).webUrl
  return typeof url === 'string' && url.length > 0 ? url : null
}

/**
 * Where to send the reader once their answer is recorded, so the last step of
 * a feedback email becomes a way back into Atlas rather than a dead end
 * (sydevs/SahajAtlasWeb#164). `?feedback=` is both the banner trigger over
 * there and the only marker that the visit came from a follow-up email.
 *
 * **A denial never lands on the event.** They have just said the class isn't
 * there, so showing them the listing is confusing — and if theirs was the
 * fifth denial, that vote has already unpublished it and `webUrl` is null,
 * because the field is publish-gated. Regions aren't (`requirePublished:
 * false` in `Regions.ts`), so the region page resolves either way.
 *
 * Pure, and takes already-loaded docs: the decision is the part worth pinning
 * in a test, and the read belongs to the caller.
 *
 * Returns null when nothing resolves — the caller keeps the reader on our own
 * confirmation card, which is also what happens until the Atlas half ships.
 */
export function feedbackDestination(args: {
  vote: 'confirmed' | 'denied'
  event: unknown
  region: unknown
}): string | null {
  const base =
    args.vote === 'confirmed' ? (webUrlOf(args.event) ?? webUrlOf(args.region)) : webUrlOf(args.region)
  if (!base) return null
  return `${base}${base.includes('?') ? '&' : '?'}feedback=${args.vote}`
}
