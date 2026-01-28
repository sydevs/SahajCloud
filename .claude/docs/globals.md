# Global Configuration Architecture

The application uses PayloadCMS Global Configs to manage centralized configuration for each project. Globals are organized into project-based folders.

## Directory Structure

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

## WeMeditate Web Config

- **Location**: `src/globals/wemeditate-web/config.ts`
- **Slug**: `wm-web-config`
- **Export**: `WeMeditateWebConfig`
- **Admin Group**: System

### Fields

- `homePage` (relationship to pages, required) - Home page content
- `featuredPages` (relationship to pages, hasMany, 2-3 items, required) - Featured pages in header/footer
- `classPages` (relationship to pages, hasMany, max 5) - Pages for seekers to start meditating
- `knowledgePages` (relationship to pages, hasMany, max 5) - Pages for seekers to learn more
- `infoPages` (relationship to pages, hasMany, max 5) - Meta pages (Privacy, Contact, etc.)

## WeMeditate Web Translations

- **Location**: `src/globals/wemeditate-web/translations.ts`
- **Slug**: `wm-web-translations`
- **Export**: `WeMeditateWebTranslations`
- **Admin Group**: WeMeditate Web
- **Versions**: Max 3

## WeMeditate App Config

- **Location**: `src/globals/wemeditate-app/config.ts`
- **Slug**: `wm-app-config`
- **Export**: `WeMeditateAppConfig`
- **Admin Group**: WeMeditate App

## WeMeditate App Translations

- **Location**: `src/globals/wemeditate-app/translations.ts`
- **Slug**: `wm-app-translations`
- **Export**: `WeMeditateAppTranslations`
- **Admin Group**: WeMeditate App
- **Versions**: Max 3

## Sahaj Atlas Config

- **Location**: `src/globals/sahaj-atlas/config.ts`
- **Slug**: `sy-atlas-config`
- **Export**: `SahajAtlasConfig`
- **Admin Group**: System

### Fields

- `defaultMapCenter` (group) - Default map center coordinates
  - `latitude` (number, required, default: 0)
  - `longitude` (number, required, default: 0)
- `defaultZoomLevel` (number, 1-20, default: 10)

## Sahaj Atlas Translations

- **Location**: `src/globals/sahaj-atlas/translations.ts`
- **Slug**: `sy-atlas-translations`
- **Export**: `SahajAtlasTranslations`
- **Admin Group**: Sahaj Atlas
- **Versions**: Max 3

## Naming Convention

| Project | Config Export | Config Slug | Translations Export | Translations Slug |
|---------|--------------|-------------|---------------------|-------------------|
| WeMeditate Web | `WeMeditateWebConfig` | `wm-web-config` | `WeMeditateWebTranslations` | `wm-web-translations` |
| WeMeditate App | `WeMeditateAppConfig` | `wm-app-config` | `WeMeditateAppTranslations` | `wm-app-translations` |
| Sahaj Atlas | `SahajAtlasConfig` | `sy-atlas-config` | `SahajAtlasTranslations` | `sy-atlas-translations` |

## Project Visibility

Globals are assigned to projects in `src/lib/access/config/projects.ts` and automatically shown/hidden based on the manager's current project selection.
