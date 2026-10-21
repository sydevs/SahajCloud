import type { TaskOutput } from 'payload'

/**
 * `cleanupCollections` reports one count per collection it touched rather than a
 * named counter per collection, so a spec asks for the one it seeded. A
 * collection the run left alone is absent from the array, which is zero.
 *
 * Typed off the generated task contract, not a hand-written shape, for the
 * reason `taskRunner.ts` gives: a restatement drifts from the output it checks.
 */
export const deletedIn = (output: TaskOutput<'cleanupCollections'>, collection: string): number =>
  output.collections.find((count) => count.collection === collection)?.deleted ?? 0
