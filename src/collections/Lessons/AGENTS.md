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

## `introAudio` is per locale, and its subtitles are its file's (#1016)

One recording was shared across all 19 languages, so a step narrated in English
subtitled every language. `introAudio` is localized, and not `required`, for the
`title` reason above. Its migration carries a hand-written backfill into the
`en` row, because the generated delta drops the base column without reading it.

**The subtitles are not stored on the step.** A recording's transcript belongs
to the recording — its `files` row — so every step and language using a file
shares one transcript, and swapping the file swaps the subtitles; they cannot
follow a recording that is no longer attached. The same holds for a panel
video's subtitles, which is why `panels[].subtitles` is gone too.

- **Made on upload.** An MP3 is transcribed when it is saved, a video when
  Cloudflare Stream reports it ready, and the run detects the language
  (`src/lib/transcripts/`, `TranscribeRecording`). A wrong guess is corrected on
  the file's Transcript panel, and a re-run there serves every step using it.
- **Shown, never edited, here.** `introTranscript` and `mediaTranscript` are
  `ui` fields rendering `FileTranscriptPreview`, read-only, with the file's own
  panel a drawer away. Spellings are corrected for every transcript by the
  glossary (`src/collections/Transcripts/glossary.json`).
- **Read by the app through the file**: `introAudio.subtitles` and
  `panels[].media.subtitles`, a virtual field on `files`, because a join on a
  populated upload answers bare ids at any depth.
- ⚠ **`introSubtitles` survives only as a read-only virtual copy** of
  `introAudio.subtitles`, for app releases that still read it. It is a
  `shortcut:` tracked by #1133; delete it once none does.

The 28 hand-made English cue sets became their files' transcripts in the
migration, marked `imported`, so nothing was paid to redo them.

**`introAudio` carries `filterOptions: { mimeType: { equals: 'audio/mpeg' } }`,
and must never carry a custom `validate`.** `validateFilterOptions` lives inside
Payload's own `relationship` validator, installed only where the field supplies
none, so a validator here would narrow the picker and enforce nothing
(`src/collections/AGENTS.md`).

**Launch Readiness turns mostly red here, by design.** Judged on a locale's own
value, `intro-audio-set` and `intro-subtitles-set` (a finished transcript on that
locale's intro file) are red in 18 of 19 locales
for every step from day one. That is the existing gap made visible, not a
regression.
