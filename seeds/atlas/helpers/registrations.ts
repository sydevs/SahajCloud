/**
 * The registrant's answers as `submissionData` pairs, plus their name.
 *
 * `name` is a base key every type accepts, and it is what
 * `prepareUserSubmission` reads to name the `users` row it upserts — without it
 * a historical registrant is renamed after the local part of their address.
 * There is deliberately no `locale` pair: the Atlas dump carries no locale for
 * a registrant, and deriving one from the event's region would put an
 * unevidenced value in a column the reminder emails read.
 *
 * Its own module so the local sync tooling (`sync/check.ts`) can run it
 * without loading the importer, which boots Payload.
 */
import { EVENT_REGISTRATION_QUESTIONS } from '@/lib/registrations/questions'

export function registrationSubmissionData(
  reg: { questions?: Record<string, unknown> | null },
  registrant: { name?: string | null },
): { field: string; value: string }[] {
  const pairs: { field: string; value: string }[] = []
  const name = registrant.name?.trim()
  if (name) pairs.push({ field: 'name', value: name })

  // The contract's order, not the dump's, so two rows with the same answers
  // produce the same pairs.
  for (const question of EVENT_REGISTRATION_QUESTIONS) {
    const raw = reg.questions?.[question.name]
    const value = typeof raw === 'string' ? raw.trim() : raw == null ? '' : String(raw)
    if (value) pairs.push({ field: question.name, value })
  }
  return pairs
}
