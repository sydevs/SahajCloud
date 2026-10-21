/**
 * `sweepRetention` reports one count per collection it touched rather than a
 * named counter per collection, so a spec asks for the one it seeded. A
 * collection the run left alone is absent from the array, which is zero.
 */
export const deletedIn = (
  output: { collections: { collection: string; deleted: number }[] },
  collection: string,
): number => output.collections.find((count) => count.collection === collection)?.deleted ?? 0
