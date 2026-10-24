# Meditations

## Locale handling (special)

Meditations don't use field-level localization — each meditation **is** a
single-locale document:

- A `locale` select field with all 19 options, default `en`.
- `filterMeditationsByLocale` (a beforeOperation hook in
  `src/collections/Meditations/hooks/`) adds `{ locale: { equals:
req.locale } }` to `find`/`count` operations.
- `findByID` returns the specific doc regardless of locale.
- `locale=all` bypasses filtering.
- A **versions read** bypasses filtering too. That rule — which hooks need
  the guard, and why this filter is declined rather than translated — is in
  `src/collections/AGENTS.md`.
- **Writes are scoped separately**, since that hook deliberately skips them: a
  non-admin manager's create/update is narrowed to the locale their
  `meditations-editor` role was read in (#980, `docs/rules/access.md`). A create
  that states no language — a **duplicate** — is caught by
  `restrictCreateToRequestLocale` instead, the first place the filled value
  exists. Both live in `src/plugins/access/localeScopedWrites.ts` and reach this
  collection because `LOCALE_SCOPED_COLLECTIONS` names it — nothing is wired
  here.

Testing a non-English query: `tests/AGENTS.md`.
