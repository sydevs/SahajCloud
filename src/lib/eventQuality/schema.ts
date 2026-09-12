/**
 * The schema behind `EventQualityReport`, for `Events.qualityReport`.
 *
 * Flat, because `title` stopped being localized — the Atlas widget translates
 * client-side from the one stored value.
 *
 * That column is virtual: `computeEventQualityReport` is its only writer and
 * nothing stores it, so the shape can be closed — no row exists under an
 * earlier one to strand. `event-quality.spec.ts` pins the two definitions to
 * each other, so a new key on the type fails the unit lane until it lands here.
 *
 * **Named here rather than inline at the field**: a two-branch discriminated
 * union is past what a reader can take in beside a field's admin config.
 */
import { z } from 'zod'

/**
 * Two shapes, discriminated by `skipped`. Written as a union of two objects
 * rather than one object with optional keys so the generated type keeps the
 * discriminator — a reader that has narrowed on `skipped === false` gets
 * `checks` non-null.
 */
export const eventQualityReportZodSchema = z.union([
  z.strictObject({
    skipped: z.literal(true),
    reason: z
      .enum(['unpublished', 'finished', 'expired', 'denied', 'trashed'])
      .describe('Why the checks were not run at all.'),
  }),
  z.strictObject({
    skipped: z.literal(false),
    checks: z.array(
      z.strictObject({
        key: z.string().describe('Stable check id, labelled elsewhere.'),
        status: z.enum(['passed', 'failed', 'pending']),
        detail: z
          .string()
          .optional()
          .describe('What went wrong, for a check folding several problems into one.'),
      }),
    ),
    openCount: z.number().describe('Failed items — what `qualityOpenCount` stores.'),
  }),
])
