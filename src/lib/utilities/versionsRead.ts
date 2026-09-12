import type { CollectionBeforeOperationHook } from 'payload'

type BeforeOperationArgs = Parameters<CollectionBeforeOperationHook>[0]

/**
 * Whether a `beforeOperation` hook is running on a **versions** read.
 *
 * Payload maps four operations onto the single `read` hook operation
 * (`payload/dist/collections/operations/utilities/types.js` →
 * `operationToHookOperation`): `find`, `findByID`, `findVersions` and
 * `findVersionByID`. So a hook that guards on `operation === 'read'` runs on a
 * versions read as well, and any `where` it appends is applied to the
 * **versions** collection — where a document's own fields live under `version.`
 * and its id is `parent`. Naming a document field there fails query validation
 * with `The following path cannot be queried`, before the read runs and
 * regardless of `overrideAccess`. That 400 broke the admin version-history tab
 * for meditations (#745). `src/collections/AGENTS.md` carries the rule for the
 * next hook author.
 *
 * The two kinds are told apart by the **`draft` argument**. Every `find` and
 * `findByID` call site passes it — the Local API and the REST handler are the
 * only two callers of each operation, and the Local API defaults it to `false`
 * — while neither versions read passes it at all:
 *
 * | operation         | hook operation | `id` | `draft` |
 * | ----------------- | -------------- | ---- | ------- |
 * | `find`            | `read`         | ✗    | ✓       |
 * | `findByID`        | `read`         | ✓    | ✓       |
 * | `findVersions`    | `read`         | ✗    | ✗       |
 * | `findVersionByID` | `read`         | ✓    | ✗       |
 *
 * `count` and `countVersions` map to their own hook operations, so a counting
 * hook never reaches the `draft` test — hence the `read` gate here rather than
 * at each call site.
 *
 * This reads a Payload-internal argument shape, so an upgrade could change it.
 * The pin is a real `findVersions` in `tests/int/meditations.int.spec.ts` and
 * `tests/int/events.int.spec.ts`, not a unit test that would agree with itself.
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
