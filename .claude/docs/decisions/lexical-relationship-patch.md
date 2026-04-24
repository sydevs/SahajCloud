# Decision: pnpm patch `@payloadcms/richtext-lexical` for whitelist visibility bypass

**Pinned version**: `@payloadcms/richtext-lexical@3.82.1`
**Patch file**: [patches/@payloadcms__richtext-lexical@3.82.1.patch](../../../patches/@payloadcms__richtext-lexical@3.82.1.patch)

## What it does

Modifies `dist/features/relationship/client/utils/useEnabledRelationships.js` so that collection slugs passed in `enabledCollections` bypass the `visibleEntities` filter that normally drops `admin.hidden: true` collections from the rich-text relationship picker.

The change is a single condition:

```diff
-      if (!visibleEntities?.collections.includes(slug)) {
+      if (!(whitelistSet && whitelistSet.has(slug)) && !visibleEntities?.collections.includes(slug)) {
         continue;
       }
```

Collections not in the whitelist still go through the usual visibility check. `enableRichTextRelationship`, upload-vs-relationship gating, and blacklist checks are unchanged.

## Why

[LectureClips](../../../src/collections/resources/LectureClips.ts) sets `admin.hidden: true` so clips are edited through the parent Lecture's `clips` join rather than a flat sidebar listing. Upstream Lexical couples nav visibility with relationship-picker visibility via a single `EntityVisibilityProvider`, so keeping clips out of the sidebar also kept them out of the picker despite being listed in `enabledCollections` on [fullRichTextEditor](../../../src/lib/richEditor.ts).

The alternatives (remove `admin.hidden`, custom Nav component, CSS-hide the sidebar entry) all had worse trade-offs: sidebar clutter, heavy ownership surface, or fragile DOM-level hacks. A one-line, pnpm-tracked patch on a trivial helper was the least-invasive way to let whitelists opt specific slugs past the visibility gate.

## Upgrade checklist

Every time `@payloadcms/richtext-lexical` gets bumped, do this:

1. `pnpm patch --edit @payloadcms/richtext-lexical@<new-version>`
2. Open `dist/features/relationship/client/utils/useEnabledRelationships.js` in the scratch dir. Confirm the surrounding loop still looks like the structure patched here (single `for` over `collections`, same check order).
3. If unchanged, re-apply the same one-condition edit and `pnpm patch-commit <scratch-dir>`.
4. If the file layout has drifted (hook split, moved, inlined into the plugin, etc.), stop and reassess — the `enabledCollections` option may now behave differently upstream, which could make this patch unnecessary or require a new patch point.
5. `pnpm install` — installation hard-fails if the stored patch no longer applies, so drift is loud.
6. Delete the old `patches/@payloadcms__richtext-lexical@<old>.patch` file that `pnpm patch-commit` superseded.

## Scope caveats

- The same hook is consumed by the Lexical Upload feature (`features/upload/client/plugin/index.js`). The bypass applies there too, but only has an effect if a caller whitelists a hidden upload collection, which we don't.
- If a user lacks read access to a whitelisted hidden collection, the picker will still list the collection by name but the item drawer will be empty — the same failure mode as any other collection the user can't list.

## Verification

Manual: as a `path-editor` manager in `wemeditate-app`, open a Page's rich-text `content` field → Insert Relationship → `Lecture Clip` appears alongside Pages / Forms / Albums / App Cards. The admin sidebar still omits LectureClips.
