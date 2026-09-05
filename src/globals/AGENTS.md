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

**Sahaj Atlas** (admin group: System) — `languages` (required array, min 1,
one `code` select per row from the CMS locales), `defaultMapCenter` group
(required `latitude`/`longitude`), `defaultZoomLevel` (1–20).

`languages` is the **source of truth for which languages the atlas offers**
(#645): the SEO endpoint reads it for every page's `hreflang` cluster. It
replaced a constant duplicated across two repos. `ATLAS_DEFAULT_LOCALES`
(`src/lib/atlas/defaultLocales.ts`) is both its `defaultValue` and the
fallback for an unconfigured column, so the two cannot drift — the fallback
matters because a `defaultValue` never backfills an existing global row.

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

### Per-key character limit (`maxLength`)

A `string` leaf may carry an optional `maxLength` — a soft limit for its
on-screen UI slot (a status chip, an action label). It threads schema →
`admin.custom` → `TranslationsRow`, which shows the limit and, once
exceeded, a live count plus a warning icon. **Advisory only** — the field's
`validate` is unchanged, so an over-limit string still saves. It lives in
`admin.custom`, not the DB schema, so tuning one needs no migration. The
comparison lives in `lengthStatus`
(`src/components/admin/TranslationsRow/lengthStatus.ts`, unit-tested),
which counts Unicode code points. Budget generously for keys with `%{...}`
placeholders — the raw stored string is measured, and the placeholder
expands at render.

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
