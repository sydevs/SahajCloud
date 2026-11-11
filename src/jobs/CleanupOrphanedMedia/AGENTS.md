# CleanupOrphanedMedia

## Schema introspection (auto-discover field references)

To find every field that references a particular collection (e.g. every
field pointing at `files` or `images`), use the helpers in
`src/jobs/CleanupOrphanedMedia/schemaUtils.ts` instead of hardcoding
collection/field knowledge.

⚠ **Read `depth: 0, locale: 'all'`, or a reference held only by a localized
field is invisible** — and an invisible reference reads as an orphan, so the
job trashes a file that is in use. `locale: 'all'` wraps a localized field's
value in a `{ [locale]: value }` map. Which path segments carry one is
recorded on the reference as `localizedAt` by the walk, off each field's own
`localized` flag, and `localeValues` splits exactly there. No key is
inspected, so a group whose subfields are named like locale codes cannot be
read as a translation, and no locale list can be forgotten.

`CleanupOrphanedMedia` uses this pattern to discover unreferenced `files`
and `images` without hardcoded knowledge.

## `parseInt` pitfall (relevant to ID extraction)

`parseInt('1748234234_abcdef', 10) === 1748234234` — it parses the leading
digits and silently ignores non-numeric suffixes. Validate strings are
fully numeric before parsing.

This caught a real bug in schema introspection where Lexical block IDs
like `'1748234234_abcdef'` were parsed as valid IDs.

## A Lexical id names no collection

⚠ **A block stores a bare id**, so the content alone cannot say whether `14`
is a file or an image. Reading every id as a reference to both made one
collection's live document count against the other's trash, and the two
sequences overlap (#1118). The walk records, per block slug, the **name** of
each block field pointing at the target — read off the editor's own sanitized
block definitions, under
`editor.editorConfig.resolvedFeatureMap.get('blocks').sanitizedServerFeatureProps.blocks`
— and the content walk extracts only those names. `payload.config.blocks` is
the registry for block _references_, which these editors do not use, and is
empty.

The name, not the path: the content walk meets a block's fields by name, and
reaches an array's items without a path of its own.

⚠ **An empty allowlist is invisible except in the integration lane.** If
Payload moves that shape, `lexicalBlocks` returns nothing, every block
reference disappears, and the job trashes media a page still shows. The three
`preserves images referenced in pages …Block` cases in
`tests/int/cleanup-orphaned-media.int.spec.ts` are what fail when it does.

An embedded upload or relationship node is the other half: it carries its own
`relationTo`, so it is matched directly rather than through a block.

## Phase A re-checks the sets

Both phases read the same referenced-id sets, built once per run before Phase
A. A trashed row in its own collection's set is **skipped, not deleted** —
counted in `skippedReferenced` and logged with its collection and id. Age
alone used to be the whole test, which deleted an item hand-trashed while a
page still showed it (#1118).
