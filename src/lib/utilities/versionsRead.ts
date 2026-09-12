import type { CollectionBeforeOperationHook } from 'payload'

type BeforeOperationArgs = Parameters<CollectionBeforeOperationHook>[0]

/**
 * Whether a `beforeOperation` hook is running on a **versions** read.
 *
 * Payload maps four operations onto the single `read` hook operation, so a hook
 * guarding on `operation === 'read'` runs on a versions read too — where a
 * `where` naming a document field fails query validation (#745).
 * **`src/collections/AGENTS.md` carries the rule**: which hooks need this, when
 * to decline a filter rather than translate it, and what to pin.
 *
 * The two kinds are told apart by the **`draft` argument**, which every `find`
 * and `findByID` call site passes and neither versions read does. That table is
 * the one part of the rule which cannot live anywhere else — derived from
 * `payload/dist/collections/operations/utilities/types.js` →
 * `operationToHookOperation` and all four operations' callers, read at 3.86.0:
 *
 * | operation         | hook operation | `id` | `draft` |
 * | ----------------- | -------------- | ---- | ------- |
 * | `find`            | `read`         | ✗    | ✓       |
 * | `findByID`        | `read`         | ✓    | ✓       |
 * | `findVersions`    | `read`         | ✗    | ✗       |
 * | `findVersionByID` | `read`         | ✓    | ✗       |
 *
 * `count` and `countVersions` map to their own hook operations, so a counting
 * hook never reaches the `draft` test — hence the `read` gate below rather than
 * one at each call site.
 */
export function isVersionsRead(
  operation: BeforeOperationArgs['operation'],
  args: BeforeOperationArgs['args'],
): boolean {
  if (operation !== 'read') {
    return false
  }

  return !('draft' in args)
}
