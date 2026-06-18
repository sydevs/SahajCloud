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

**Sahaj Atlas** (admin group: System) — `defaultMapCenter` group with
required `latitude`/`longitude`, `defaultZoomLevel` (1–20).

## Translation globals (per project)

All translations globals share a tab-based structure built by
`buildTranslationTabs()` from a `translationsSchema.json` co-located with
the global. Versions: max 3.

- WeMeditate Web tabs: Common, Navigation
- WeMeditate App tabs: Daily, Path, Explore, Profile, Meditation
- Sahaj Atlas tabs: Common, Map, Location

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

## Project visibility

Globals are assigned to projects in `src/plugins/access/config/projects.ts` and
automatically shown/hidden by the `accessPlugin` based on the manager's
`currentProject`. Don't write `admin.hidden` by hand on a global — let the
plugin do it.
