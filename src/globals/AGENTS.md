# Globals

PayloadCMS Global Configs hold centralized configuration per project. Each
global lives in its own PascalCase folder under `src/globals/`, named after
its TypeScript export — no per-project group folders. Only the master
barrel (`src/globals/index.ts`) imports from these folders.

```
src/globals/
├── WeMeditateWebConfig/               (slug: wm-web-config)
├── WeMeditateWebTranslations/         (slug: wm-web-translations)
│   └── translationsSchema.json
├── WeMeditateAppConfig/               (slug: wm-app-config)
├── WeMeditateAppTranslations/         (slug: wm-app-translations)
│   └── translationsSchema.json
├── WeMeditateAppStatus/               (slug: wm-app-status)
│   ├── sections/                      (per-section builders, not re-exported)
│   └── statusConfig.json
├── SahajAtlasConfig/                  (slug: sy-atlas-config)
├── SahajAtlasTranslations/            (slug: sy-atlas-translations)
│   └── translationsSchema.json
└── index.ts                           (master barrel)
```

## Config globals (per project)

**WeMeditate Web** (admin group: System) — `homePage` (relationship to
pages, required), `featuredPages` (hasMany 2–3), `featuredArticles`
(hasMany, required, min 2 — article pages for the header dropdown),
`classPages` / `knowledgePages` / `infoPages` (hasMany, max 5).

**WeMeditate App** (admin group: WeMeditate App, tabs: First Meditation) —
`selfRealizationMeditation` (localized relationship to meditations),
`postRealizationLecture` (localized relationship to lecture-clips),
`vibeCheckTracks` (localized array. Each item has an `identifier` select
plus required `audio`/`subtitles` uploads).

**Sahaj Atlas** (admin group: System) — `availableLocales`,
`canonicalFallbackClient`, `defaultMapCenter` group (required
`latitude`/`longitude`), `defaultZoomLevel` (1–20).

**WeMeditate Web** also carries `availableLocales`, after `homePage`.

### `availableLocales` — the language set, gated on published translations

`availableLocalesField({ translationsSlug, surface })`
(`src/fields/availableLocalesField.ts`) is the **source of truth for which
languages a project offers** (#645, rewritten by #705): the SEO endpoint
reads it for every atlas page's `hreflang` cluster. It replaced
`sy-atlas-config.languages`, an unvalidated array of `{ code }` rows.

Two invariants, both enforced in the field because a stored value that
breaks either is a wrong `hreflang` on every page:

1. **`en` is always available.** Every other locale falls back to it.
2. **A locale can only be offered once that project's translations are
   published in it.** The field reads the translations global once per
   request at `locale: 'all'` and rejects any selection whose `_status` is
   not `published`.

⚠ **English is exempt from the publish gate, and that is not an oversight.**
It is mandatory rather than chosen, so gating it is a deadlock, not a gate:
Payload validates the merged document on **every** save of the global — not
only when someone edits this field — and the migration that adds per-locale
`_status` lands every locale as `draft`. Gating English would leave both
config globals unsaveable after deploy, with an error telling the operator to
publish the one locale they cannot deselect.

⚠ **`locale: 'all'` is load-bearing.** A single-locale read resolves
`_status` through the English fallback, so an untranslated locale reports
itself published and the gate opens for everything. Only the raw per-locale
map answers correctly.

`req.context.skipAvailableLocalesCheck` relaxes the publish check for the
**local API only** — seeds and specs that create a config row before
anything is published. `en` stays required with it set. It is unreachable
over REST: Payload hard-codes `context: {}` on every REST request.

⚠ **Every partial write to either config global must now carry
`availableLocales`.** Payload merges the stored value into the field's
sibling data and validates it, so a `required` field with no stored value
refuses a write that never mentioned it. `seeds/wemeditate/import.ts` and two
integration suites each needed a line for this.

**An unconfigured column answers `['en']`** (`readAvailableLocales`,
`src/lib/translations/availableLocales.ts`), not the ten launch locales the
deleted `ATLAS_DEFAULT_LOCALES` used to supply. A `defaultValue` never
backfills an existing global row, and production's row exists — so the
fallback is what production sees on deploy. A wider one would tell a
crawler nine languages have pages before an operator said any of them were
translated.

> ### ⚠ Never name a global's field `locales`
>
> A global's sub-table is named `<global_table>_<field>`, and Payload
> already uses the `_locales` suffix for a localized document's value
> table. A field called `locales` on `sy-atlas-config` generates
> `sy_atlas_config_locales`, collides with that convention, and makes
> **every read of the global** fail in Drizzle's relation builder with
> `Cannot read properties of undefined (reading 'referencedTable')` — a 500
> on `GET /api/globals/<slug>`, not a build-time schema error.
>
> Reproduced on payload 3.86.0 + db-postgres, with `select` and `hasMany`,
> as a plain array, and as a localized array. **Renaming the field is the
> fix** (`languages`) — the field's shape is unrelated. The same trap
> applies to any suffix Payload reserves for a generated table: prefer a
> name that reads as the domain concept (`languages`) over one that echoes
> a framework term (`locales`).

## Translation globals (per project)

All translations globals share a tab-based structure, built by
`buildTranslationTabs()` from a `translationsSchema.json` co-located with
the global. Versions: max 3.

- WeMeditate Web tabs: Common, Navigation
- WeMeditate App tabs: Daily, Path, Explore, Profile, Meditation
- Sahaj Atlas tabs: Common, Region, Event, Registration, Share, Emails

Three things distinguish `sy-atlas-translations` and `wm-web-translations`
from `wm-app-translations` (#705):

- **Per-locale publish status.** Both set
  `versions.drafts.localizeStatus: true` (the object form — `drafts: true`
  sanitises the flag back to `false`), and `payload.config.ts` sets the
  root `experimental.localizeStatus`. Payload forces the flag off per
  entity without that root flag, so a test config that forgets it runs
  every global with one status for all locales. The admin then offers
  "Publish in \<Locale\>", "Publish all locales" and "Unpublish in
  \<Locale\>"; from the local API it is
  `updateGlobal({ locale: 'fr', publishSpecificLocale: 'fr', data: { _status: 'published' } })`.
  ⚠ "Publish all locales" includes empty ones, which `availableLocales`
  then accepts.
- **An English merge for API clients.** `clientEnglishFallback`
  (`src/lib/translations/clientEnglishFallback.ts`) is an `afterRead` hook
  that fills blank or missing keys from English when
  `req.user.collection === 'clients'`. A manager read is untouched on
  purpose — the admin and the status report must keep showing which keys
  are empty. It never re-adds a field the caller's `select` stripped, and
  it never throws.
- **`_locales` is a reserved suffix, and it is matched exactly.** Drizzle
  keys the localized-values table on the literal `<table>_locales`, never
  on a suffix, so `sy_atlas_config_available_locales` is safe. The `⚠`
  box below is still the rule for naming a field.

The Atlas `Emails` group is read **server-side** by `resolveEmailStrings()`
(`src/lib/translations/emailStrings.ts`), which supplies localized chrome
for registrant mail. Payload's locale fallback is **per field, not per
key**: a JSON blob that omits a key returns `undefined`, not the English
value, so the resolver merges over English key defaults. Add a key to
`translationsSchema.json` **and** to `EMAIL_STRING_DEFAULTS`, or it renders
blank in every locale that has any translation at all.

```typescript
import { buildTranslationTabs, type TranslationsSchema } from '@/fields'
import translationsSchema from './translationsSchema.json' with { type: 'json' }

export const MyTranslations: GlobalConfig = {
  slug: 'my-translations',
  versions: { max: 10, drafts: true },
  fields: [
    {
      type: 'tabs',
      tabs: buildTranslationTabs(translationsSchema as TranslationsSchema, 'my-translations'),
    },
  ],
}
```

### Schema → tabs

`translationsSchema.json` nests objects. Each top-level property becomes a
tab. Each leaf group emits:

- One localized JSON field, named after the leaf slug (e.g. `welcome` or
  `onboarding_welcome`), holding every `string`-typed key as flat `{ key:
  value }` pairs. `TranslationsRow` renders each key as its own row.
- One localized `richText` field per `richText` key, named
  `<leafSlug>_<key>`, with a `RichTextReference` description showing the
  English reference value.

**Why JSON-per-leaf-group, not a column per key**: Postgres caps a function
call at 100 arguments (`FUNC_MAX_ARGS`), and Drizzle hits this building
`json_build_array()` to aggregate a global's localized columns.
`wm-app-translations` has around 480 leaf keys — a column-per-key design
would exceed that cap on `findGlobal`. Per-leaf-group JSON keeps the
per-row UX inside it.

```json
{
  "type": "object",
  "properties": {
    "common": {
      "type": "object",
      "description": "Common UI strings",
      "properties": {
        "loading": { "type": "string", "description": "Loading indicator text" }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

### Translation key naming

Lowercase only. Use `_` between words (`about_meditation`, not
`aboutMeditation`). No dots — the nested schema handles grouping. Keep keys
descriptive.

### The JSON column declares its own shape

Each leaf group's JSON field carries a `jsonSchema` built by
`stringsSchema` (#705), so Payload generates a named
`<Global><Parent><Leaf>Strings` interface instead of the
`{ [k: string]: unknown } | … | null` union, and Ajv enforces the shape on
write.

- **A `validate` here must COMPOSE the built-in, never replace it.** Supplying
  one replaces Payload's built-in `json` validator — the one bound to
  `jsonSchema` — so a hand-rolled rule switches every shape check off silently.
  `createStringsJsonField` adds one check (an array, which the built-in
  short-circuits past because `[]` counts as an "empty" value) and then
  delegates to `json` from `payload/shared`.
- **Every property is optional.** Payload validates a stored column on
  every save of its document, so a `required` key would strand a locale
  that predates it, on a save that never touched translations.
- **Only standard JSON Schema keywords may appear.** Payload runs Ajv 8 in
  strict mode, where an unknown keyword throws at *validate* time, not at
  boot — so `plural`, `screenshot` and `strict` must never reach the
  emitted schema. A plural key contributes its expanded CLDR family.

### Sub-groups render as collapsibles

A tab with sub-groups still wraps them in a Payload `group` named after the
tab (API path `tab.sub.key`, column `<tab>_<sub>`), but each sub-group is a
`collapsible`, not an inner tab. Tabs inside tabs hide every sub-group but
one. A sub-group named `a11y` starts collapsed; everything else opens. This
is presentational only — the data path and column name are unchanged, so no
migration is involved. Mixing leaf keys and sub-groups at one level is
deliberately unsupported: declare explicit `general` + `a11y` sub-groups.

### Per-key character limit (`maxLength`, and `strict`)

A `string` leaf may carry an optional `maxLength` — a limit for its
on-screen UI slot (a status chip, an action label). It threads schema →
`admin.custom` → `TranslationsRow`, which shows the limit and, once
exceeded, a live count plus a warning icon. **Advisory by default** — an
over-limit string still saves. The comparison lives in `lengthStatus`
(`src/components/admin/TranslationsRow/lengthStatus.ts`, unit-tested),
which counts Unicode code points. Budget generously for keys with `%{...}`
placeholders — the raw stored string is measured, and the placeholder
expands at render.

Add **`"strict": true`** beside it to make the limit block the save. The
limit is then emitted into the field's JSON Schema, so Payload refuses the
write, and the row renders an error ("over the limit, this will not save")
instead of a warning. Reach for it where an over-length string breaks a
layout rather than merely looking untidy. Turning an existing advisory
limit strict can make keys already over it unsaveable — check first.

```json
"online_cta": {
  "type": "string",
  "description": "Call-to-action button label for joining an online class.",
  "maxLength": 28
}
```

### Plural keys (`plural: true`)

Mark a quantity-varying key `plural: true` instead of hand-declaring the
CLDR forms. The field builder expands it for storage —
`sessions_count_one`/`_few`/`_many`/`_other` (English uses one/other.
Russian, Ukrainian, Czech add few/many). The admin renders one grouped row
of per-category inputs, showing only the categories the edited locale uses,
sharing one `maxLength` counter.

```json
"sessions_count": {
  "type": "string",
  "plural": true,
  "maxLength": 18,
  "description": "Session count appended to a course's schedule. `%{count}` = number of sessions."
}
```

Selection at render time is server-side, via `pluralize()`
(`Intl.PluralRules` — see `docs/rules/email.md`), not in the CMS.
`EMAIL_STRING_DEFAULTS` must define the same expanded family (English
suffices. `few`/`many` fall back to `other`).

## Project visibility

Globals are assigned to projects in `src/plugins/access/config/projects.ts`
and shown or hidden automatically by `accessPlugin`, based on the manager's
`currentProject`. Do not set `admin.hidden` by hand on a global — let the
plugin do it.
