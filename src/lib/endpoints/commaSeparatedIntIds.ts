import { z } from 'zod'

/**
 * Zod schema for an optional comma-separated list of positive integer IDs, e.g.
 * `?excludedLectureIds=3,4,5`. Trims whitespace, drops any non-numeric part, and
 * yields `[]` when the value is omitted or empty. Shared by the related-content
 * client endpoints (`excludedLectureIds`, `excludedMeditationIds`).
 */
export const commaSeparatedIntIds = z
  .string()
  .optional()
  .transform((s) => {
    if (!s) return [] as number[]
    return s
      .split(',')
      .map((part) => part.trim())
      .filter((part) => /^\d+$/.test(part))
      .map((part) => parseInt(part, 10))
  })
