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
