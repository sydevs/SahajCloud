# Lessons ("Path Steps")

A lesson's `meditation` is a localized polymorphic relationship to
`meditations`, `videos` or `lectures`. Its `filterOptions` admits only
`type: 'lesson'` on the `meditations` branch — set that type when a test
links a meditation.

## `title` and `panels` are per locale, and neither is required (#977)

Both were shared across all 19 languages, so a translator typing in French
replaced the English every app user sees. Two production steps still hold
French in their English slots because of it.

**The array is localized, not the text fields inside it.** That keeps the
migration to one `_locale` column on `lessons_panels` rather than a new
table, makes a panel video's subtitles per-language for free, and stops one
language's translator deleting or reordering another's panels. The cost: a
panel added in English does not reach French until someone adds it there.
Launch Readiness reports an empty set (`panels-set`) and a blank title
(`lesson-title-set` — prefixed because a check key is global across
sections and app-cards owns `title-set`).

**Neither field may be `required`, and for two different reasons.** On
`panels`, `required`/`minRows`/a default row each make an update in a
second locale write a blank panel list, which then hides the panels that
locale falls back to. On `title`, `required` is worse: Payload validates a
required localized field against that locale's **own** value and the
English fallback does not satisfy it (the same behaviour
`src/collections/AGENTS.md` records for `publishSpecificLocale`), so it
refuses every write in a second locale that does not also carry a title — a translator setting only the
meditation or the article included.

**A localized upload reference is invisible to a single-locale scan.**
`CleanupOrphanedMedia` reads `locale: 'all'` for exactly this reason: a
file referenced only by a French panel would otherwise read as an orphan
and be trashed. See `src/jobs/CleanupOrphanedMedia/AGENTS.md`.
