# Seed Utilities Library

Shared utilities for import scripts. Every importer extends `BaseImporter`, whose overrides,
lifecycle hooks and helpers are read from the class itself (`BaseImporter.ts`). To add a
script, follow [seeds/AGENTS.md](../AGENTS.md#creating-a-new-seed-script).

## Writing a translation global

`seeds/translations/import.ts` owns the loop that reads one `data.<locale>.json` per locale and
publishes that locale alone. A `_meta.locale` that does not match the file's slot is an error, not
a warning: a file in the wrong slot publishes one language's words as another's.

## Error handling: two tiers

- **Helper classes** (`FileUtils`, and anything else taking a `Logger`) log with `logger.error()`
  and return `null`/`false` on failure. The caller decides what that means.
- **Importer classes** use `addError()`, which logs **and** tracks the failure in the run's report,
  then continue with the next item. An importer checks a helper's return value and calls
  `addError()` when the failure should count.

`FileUtils`' download half has had no caller since #1169 — see the ⚠ in
[seeds/AGENTS.md](../AGENTS.md) before reusing it.

## Preload pattern (skip/update mode)

Preload in `setup()` every collection whose existing docs a run checks, so `upsert()` decides
skip/update without a per-item query. Pagination exists to keep each seed request bounded; a
paginated run rebuilds its ID maps from the database, because each request is stateless.

**The cache includes soft-deleted docs** (`trash: true` on its find). A trashed row still occupies
its natural key, so it must count as "exists" — otherwise `upsert` goes straight to
`payload.create` (there is no fallback find) and duplicates the row on every re-seed. This was a
live bug: `CleanupOrphanedMedia` trashes orphaned Files/Images, so a later media-uploading run
re-uploaded them. Guarded by `tests/int/seed-importer-preload.int.spec.ts`.

Consequence worth knowing: **a deliberately-trashed doc is not re-created by a re-seed** — it is
skipped (or updated, in `--update` mode). Permanently delete it to force recreation.

**A locale-filtered collection needs the `locale` argument.** Omit it and Payload resolves the
default (`en`), so a collection whose `beforeOperation` hook appends a locale filter caches that
one locale and every other reads as absent. `meditations` is such a collection. State the code even
when it is the default, so a reader is not left deriving which rows a cache holds.

Getting this wrong is quiet, not loud: a cache miss on a preloaded collection takes the same
no-fallback-find path as a trashed row above, so a key that is not `unique` gets a second row
rather than an error. The locale cases in `tests/int/seed-importer-preload.int.spec.ts` guard both
directions.

Two limits on the argument:

- **One cache per collection**, so the first locale asked for wins. A second call under a
  different one warns and reuses it.
- **`'all'` works only where the natural key is not field-localized.** A localized key arrives as
  a per-locale object, which is neither one key nor a usable set of them: collapsing it with
  `String()` collides every row, and merging the locales answers a `cs` existence question with an
  `en` row. The preload refuses such a key and warns, so a collection keyed by a localized `title`
  must name a locale.
