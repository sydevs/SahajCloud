---
paths:
  - src/globals/**/*.ts
---

# Globals

PayloadCMS Global Configs hold centralized configuration per project.
Globals live under `src/globals/<project>/{config,translations}.ts`.

```
src/globals/
├── wemeditate-web/
│   ├── config.ts         (slug: wm-web-config)
│   └── translations.ts   (slug: wm-web-translations)
├── wemeditate-app/
│   ├── config.ts         (slug: wm-app-config)
│   └── translations.ts   (slug: wm-app-translations)
├── sahaj-atlas/
│   ├── config.ts         (slug: sy-atlas-config)
│   └── translations.ts   (slug: sy-atlas-translations)
└── index.ts
```

## Naming convention

| Project | Config Export / Slug | Translations Export / Slug |
|---|---|---|
| WeMeditate Web | `WeMeditateWebConfig` / `wm-web-config` | `WeMeditateWebTranslations` / `wm-web-translations` |
| WeMeditate App | `WeMeditateAppConfig` / `wm-app-config` | `WeMeditateAppTranslations` / `wm-app-translations` |
| Sahaj Atlas | `SahajAtlasConfig` / `sy-atlas-config` | `SahajAtlasTranslations` / `sy-atlas-translations` |

## Config globals (per project)

**WeMeditate Web** (admin group: System) — `homePage` (relationship to
pages, required), `featuredPages` (hasMany 2–3), `classPages` /
`knowledgePages` / `infoPages` (hasMany, max 5).

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
- WeMeditate App tabs: Onboarding, Daily, Path, Explore, Profile, Meditation, Auth, Navigation, General, Review
- Sahaj Atlas tabs: Common, Map, Location

### Schema → tabs

`translationsSchema.json` has a nested object structure where top-level
properties become tabs. `buildTranslationTabs()` converts each top-level
group into a tab using one of two rendering paths:

- **Flat leaf tab** — top-level group has only string properties (e.g.
  `navigation`, `general` in wm-app-translations; all wm-web-translations
  and sy-atlas-translations tabs). Renders a single localized JSON field
  backed by the `TranslationsTable` admin component.
- **Nested group tab** — top-level group has object sub-group properties
  (e.g. `daily`, `path`, `explore` in wm-app-translations). Renders a
  Payload `group` field (label false) wrapping one JSON sub-field per
  sub-group. Sub-group JSON URIs use `parentSlug_subSlug` format to avoid
  Monaco schema collisions (e.g. `a://wm-app-translations/daily_main.json`).
  The API data shape is `{ daily: { main: {...}, common: {...} } }`.

```json
{
  "type": "object",
  "properties": {
    "navigation": {
      "type": "object",
      "description": "Navigation strings (flat)",
      "properties": {
        "home": { "type": "string", "description": "Home tab label" }
      },
      "additionalProperties": false
    },
    "daily": {
      "type": "object",
      "description": "Daily section (nested)",
      "properties": {
        "main": {
          "type": "object",
          "properties": {
            "start_now": { "type": "string", "description": "Start now CTA" }
          }
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

```typescript
import { buildTranslationTabs, type TranslationsSchema } from '@/fields'
import translationsSchema from './translationsSchema.json' with { type: 'json' }

export const MyTranslations: GlobalConfig = {
  slug: 'my-translations',
  fields: [
    {
      type: 'tabs',
      tabs: buildTranslationTabs(translationsSchema as TranslationsSchema, 'my-translations'),
    },
  ],
}
```

### Translation key naming

- Lowercase only (no uppercase letters).
- Use `_` to separate words (`about_meditation`, not `aboutMeditation`).
- No dots — group structure is handled by the nested schema.
- Descriptive — keys should be self-explanatory.

## Project visibility

Globals are assigned to projects in `src/lib/access/config/projects.ts` and
automatically shown/hidden by the `accessPlugin` based on the manager's
`currentProject`. Don't write `admin.hidden` by hand on a global — let the
plugin do it.
