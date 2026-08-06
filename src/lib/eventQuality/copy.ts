/**
 * Every word the listing-quality panel shows a manager, in one place.
 *
 * This file is meant to be edited on its own — change the wording here and
 * nothing else needs touching. `checks.ts` owns *when* a check fails; this owns
 * *what it says* when it does.
 *
 * Each entry has:
 * - `label` — the recommendation, in the imperative, shown when the check fails.
 * - `passedLabel` — the same item as a state already reached, shown when it passes.
 *   Never reuse `label` here: a tick beside "Take the address out" reads as an
 *   endorsement of leaving it in.
 * - `description` — the sentence under an open recommendation.
 * - `detail` — for the two checks that fold several problems into one finding,
 *   the sentence that names what was actually found. `%{problems}` is replaced
 *   with the list; the `problems` map below supplies each phrase.
 *
 * Placeholders use the `%{name}` convention used throughout the project's
 * translation schemas.
 */

/** Phrases naming what a description or title repeats, joined into one sentence. */
export const REDUNDANCY_PHRASES = {
  address: 'the address',
  schedule: 'the day or time',
  contact: 'contact details',
  link: 'a web link',
  staleDate: 'a date that has passed',
} as const

export type RedundancyKind = keyof typeof REDUNDANCY_PHRASES

export const EVENT_QUALITY_COPY = {
  'description.missing': {
    label: 'Add a description',
    passedLabel: 'Has a description',
    description:
      'Encourage seekers to join with an inviting message. Help them feel comfortable by giving information about what they should expect and how to find the room.',
  },

  'description.quality': {
    label: 'Improve the event description',
    passedLabel: 'Has a good quality description',
    description:
      'The listing already shows this on its own, and a copy in the description goes stale as soon as the real field changes.',
    detail:
      'The description repeats %{problems}. The listing already shows this on its own, and a copy here goes stale as soon as the real field changes.',
  },

  'title.quality': {
    label: 'Improve the event title',
    passedLabel: 'Has a good quality title',
    description:
      'The listing already shows this on its own, and a copy in the title goes stale as soon as the real field changes.',
    detail:
      'The title repeats %{problems}. The listing already shows this on its own, and a copy here goes stale as soon as the real field changes.',
    /** Shown when the title is merely generic — nothing repeated, nothing added. */
    genericDetail:
      'The title says nothing the listing doesn’t already. Leave it blank and it fills in from the venue name instead.',
  },

  'images.insufficient': {
    label: 'Add photos',
    passedLabel: 'Has 3+ photos',
    description: 'Add a few photos of the room or the group meditating to attract more seekers.',
  },
} as const

/** Explanations for why a listing isn't being checked at all. */
export const SKIP_REASON_COPY = {
  trashed:
    'This event is in the trash, so its listing isn’t checked. Restore it to see recommendations.',
  finished:
    'This event’s schedule has ended, so its listing isn’t checked. Extend the end date to see recommendations.',
  expired:
    'This event expired and is hidden from the public. Republish it to verify — recommendations return once it’s listed again.',
  unpublished:
    'This event isn’t published yet, so its listing isn’t checked. Publish it to see recommendations.',
} as const

/** Interpolate `%{name}` placeholders — the project's translation convention. */
export function fillCopy(template: string, values: Record<string, string>): string {
  return template.replace(/%\{(\w+)\}/g, (match, key: string) => values[key] ?? match)
}
