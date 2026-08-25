---
paths:
  - src/globals/**/*.ts
---

# Globals

PayloadCMS Global Configs hold centralized configuration per project. Each
global lives in its own PascalCase folder under `src/globals/`, named after
its TypeScript export — no per-project group folders. The master barrel
(`src/globals/index.ts`) is the only file that imports from these folders.

```
src/globals/
├── WeMeditateWebConfig/
│   └── WeMeditateWebConfig.ts        (slug: wm-web-config)
├── WeMeditateWebTranslations/
│   ├── WeMeditateWebTranslations.ts  (slug: wm-web-translations)
│   └── translationsSchema.json
├── WeMeditateAppConfig/
│   └── WeMeditateAppConfig.ts        (slug: wm-app-config)
├── WeMeditateAppTranslations/
│   ├── WeMeditateAppTranslations.ts  (slug: wm-app-translations)
│   └── translationsSchema.json
├── WeMeditateAppStatus/              (slug: wm-app-status)
│   ├── WeMeditateAppStatus.ts
│   ├── sections/                     (per-section builders, not re-exported)
│   └── statusConfig.json
├── SahajAtlasConfig/
│   └── SahajAtlasConfig.ts           (slug: sy-atlas-config)
├── SahajAtlasTranslations/
│   ├── SahajAtlasTranslations.ts     (slug: sy-atlas-translations)
│   └── translationsSchema.json
└── index.ts                          (master barrel)
```

## Naming convention

| Project        | Config Export / Slug                    | Translations Export / Slug                          |
| -------------- | --------------------------------------- | --------------------------------------------------- |
| WeMeditate Web | `WeMeditateWebConfig` / `wm-web-config` | `WeMeditateWebTranslations` / `wm-web-translations` |
| WeMeditate App | `WeMeditateAppConfig` / `wm-app-config` | `WeMeditateAppTranslations` / `wm-app-translations` |
| Sahaj Atlas    | `SahajAtlasConfig` / `sy-atlas-config`  | `SahajAtlasTranslations` / `sy-atlas-translations`  |

## Config globals (per project)

**WeMeditate Web** (admin group: System) — `homePage` (relationship to
pages, required), `featuredPages` (hasMany 2–3), `featuredArticles`
(hasMany, required, min 2 — article pages for the header dropdown),
`classPages` / `knowledgePages` / `infoPages` (hasMany, max 5).

**WeMeditate App** (admin group: WeMeditate App, tabs: First Meditation) —
`selfRealizationMeditation` (localized relationship to meditations),
`postRealizationLecture` (localized relationship to lecture-clips),
`vibeCheckTracks` (localized array; each item has `identifier` select with
predefined codes plus required `audio` / `subtitles` uploads to files).

**Sahaj Atlas** (admin group: System) — `languages` (required array, min 1, one
`code` select per row from the CMS locales), `defaultMapCenter` group with
required `latitude`/`longitude`, `defaultZoomLevel` (1–20).

`languages` is the **source of truth for which languages the atlas is offered
in** (#645): the SEO endpoint reads it for every page's `hreflang` cluster, and
sydevs/SahajAtlasWeb#167 will drive the widget's own picker from it. It replaced
a constant duplicated across the two repos. `ATLAS_DEFAULT_LOCALES`
(`src/lib/atlas/defaultLocales.ts`) is both its `defaultValue` and the fallback
for an unconfigured column — one definition so the two cannot drift, and the
fallback is what keeps an existing installation unchanged, since a `defaultValue`
does not backfill a global row that already exists.

> ### ⚠ Never name a global's field `locales`
>
> A global's sub-table is named `<global_table>_<field>`, and Payload already
> uses the `_locales` suffix for a **localized** document's value table. So a
> field called `locales` on `sy-atlas-config` generates
> `sy_atlas_config_locales`, collides with that convention, and makes **every
> read of the global** fail in Drizzle's relation builder with
> `Cannot read properties of undefined (reading 'referencedTable')` — a 500 on
> `GET /api/globals/<slug>`, not a schema error at build time.
>
> Reproduced on payload 3.86.0 + db-postgres with `select` + `hasMany`, with an
> array, and with the array localized, against both the dev database and a fresh
> test schema. **Renaming the field is the fix** (`languages`); the field *shape*
> is unrelated. The same trap applies to any suffix Payload reserves for a
> generated table — prefer a field name that reads as the domain concept
> (`languages`) over one that echoes a framework term (`locales`).

## Translation globals (per project)

All translations globals share a tab-based structure built by
`buildTranslationTabs()` from a `translationsSchema.json` co-located with
the global. Versions: max 3.

- WeMeditate Web tabs: Common, Navigation
- WeMeditate App tabs: Daily, Path, Explore, Profile, Meditation
- Sahaj Atlas tabs: Common, Region, Event, Registration, Share, Emails

The Atlas `Emails` group is read **server-side** (not just exported to the
widget) by `resolveEmailStrings()` in `src/lib/translations/emailStrings.ts`,
which supplies the localized chrome for registrant mail. Note Payload's locale
fallback is **per field, not per key**: a JSON blob that exists but omits a key
yields `undefined`, not the English value — so the resolver merges over English
key defaults. Add a key to `translationsSchema.json` *and* to
`EMAIL_STRING_DEFAULTS`, or it renders blank in every locale that has any
translation at all.

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

`translationsSchema.json` has a nested object structure where top-level
properties become tabs. Each leaf group emits:

- one localized JSON field named after the (possibly nested) leaf slug
  — e.g. `welcome` or `onboarding_welcome` — holding every `string`-typed
  key as flat `{ key: value }` pairs. Rendered by `TranslationsRow`,
  which displays each key as its own row (title + description + optional
  English reference + input).
- one localized `richText` field per `richText` key, named
  `<leafSlug>_<key>`. Renders Payload's standard Lexical editor with a
  custom `RichTextReference` description above showing the title +
  English reference value.

The legacy `welcome.strings.title` nesting and the `group` wrapper for
mixed leaves are gone — data paths are flat at the tab level.

Why JSON-per-leaf-group instead of a column-per-key: SQLite (and
Cloudflare D1) limit `json_array()` to ~100 arguments, which Drizzle
uses when aggregating a global's localized columns. `wm-app-translations`
has ~480 leaf keys; a column-per-key design exceeds the limit on
`findGlobal`. Per-leaf-group JSON keeps the per-row UX while staying
within SQL constraints.

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

- Lowercase only (no uppercase letters).
- Use `_` to separate words (`about_meditation`, not `aboutMeditation`).
- No dots — group structure is handled by the nested schema.
- Descriptive — keys should be self-explanatory.

### Per-key character limit (`maxLength`)

A `string` leaf property may carry an optional `maxLength` (a number) — a soft
character limit for the key's on-screen UI slot (status chip, action label).
It's a non-JSON-Schema extension of the leaf, sitting at the key level the same
way `screenshot` sits at the group level:

```json
"online_cta": {
  "type": "string",
  "description": "Call-to-action button label for joining an online class.",
  "maxLength": 28
}
```

It threads schema → `SchemaEntry` → `admin.custom` → `TranslationsRow`, which
shows the limit inline ("max 28 characters") and, once exceeded, a live count +
`WarningIcon`. **Advisory only** — the field `validate` is unchanged, so an
over-limit string still saves (this is a soft budget, *not* an enforced
`maxLength`). It rides in `admin.custom` (not the DB schema), so adding/tuning
one needs no migration. The comparison lives in the pure `lengthStatus` helper
(`src/components/admin/TranslationsRow/lengthStatus.ts`, unit-tested), which
counts Unicode code points and, for a plural row, takes the longest across its
category inputs. Budget generously for keys with `%{...}` placeholders — the raw
stored string is measured, and the placeholder expands or contracts at render.

### Plural keys (`plural: true`)

For a string that varies by quantity, mark the single key `plural: true` rather
than hand-declaring the CLDR forms:

```json
"sessions_count": {
  "type": "string",
  "plural": true,
  "maxLength": 18,
  "description": "Session count appended to a course's schedule. `%{count}` = number of sessions."
}
```

The field builder **expands** it into the CLDR family for storage —
`sessions_count_one` / `_few` / `_many` / `_other` (the union across the app's
locales: English uses one/other; Russian, Ukrainian, and Czech add few/many).
The admin renders **one grouped row** of per-category inputs, showing only the
categories the edited locale uses (`Intl.PluralRules`) and sharing a single
`maxLength` counter (the longest form wins). The keys stored/read are the
expanded ones, so the resolver side is unchanged.

Selection at render time is **server-side** in the resolver via `pluralize()`
(`Intl.PluralRules` — see `.claude/rules/email.md`), not in the CMS.
`EMAIL_STRING_DEFAULTS` must define the same expanded family (English suffices —
`few`/`many` fall back to `other`). The older convention-only
`region.locations.description_one`/`_other` predates this and can adopt
`plural: true`.

## Project visibility

Globals are assigned to projects in `src/plugins/access/config/projects.ts` and
automatically shown/hidden by the `accessPlugin` based on the manager's
`currentProject`. Don't write `admin.hidden` by hand on a global — let the
plugin do it.
