/**
 * What screening recorded about a submission — one shape for all four types.
 *
 * A leaf module, for the same reason as the two per-collection files it
 * replaces: the (Phase 2) job writes this shape and the admin banner renders
 * it, and neither imports the other.
 *
 * **This column, not `status`, is where the machine verdict lives.** The four
 * shared statuses fold a spam verdict and a human decline into one `rejected`,
 * which is what lets every type share a vocabulary — so abuse counting reads
 * `screeningResult.verdict` and never `status`, and a manager declining a
 * proposal is not a spam strike against its sender.
 */

/**
 * Why a submission was refused, or `ok`. One reason — the first check that hit.
 *
 * The union of what the two screening jobs recorded separately, minus the
 * per-collection wording: the copy that made them un-shareable lived in the
 * notes, and the notes are composed by the job, which knows the domain.
 *
 * A runtime list as well as a type, because the verdict is read back out of a
 * JSON column — a value outside this list means the column holds something this
 * code did not write.
 */
export const SUBMISSION_VERDICTS = [
  'ok',
  'disposable_email',
  'invalid_email',
  'no_mx_records',
  'repeat_sender',
  'duplicate_body',
  'content_rejected',
] as const

export type SubmissionVerdict = (typeof SUBMISSION_VERDICTS)[number]

/**
 * ⚠ **This module stays zero-dependency, and carries no schema.** It is a leaf
 * so an admin component can name a verdict without pulling the collection's
 * hooks — and a `zod` shape here would pull `zod` and a `toJSONSchema` call
 * into whatever browser chunk imports it, to describe a column only the server
 * validates (`src/collections/AGENTS.md`). The shape is declared in Zod at its
 * field, in `fields.ts`, and it reads this list.
 */
