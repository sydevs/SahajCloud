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

Testing a non-English query: `tests/AGENTS.md`.
