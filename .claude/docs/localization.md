# Localization Architecture

The application supports comprehensive localization for 16 locales: English (`en`), Spanish (`es`), German (`de`), Italian (`it`), French (`fr`), Russian (`ru`), Romanian (`ro`), Czech (`cs`), Ukrainian (`uk`), Greek (`el`), Armenian (`hy`), Polish (`pl`), Brazilian Portuguese (`pt-br`), Farsi/Persian (`fa`), Bulgarian (`bg`), and Turkish (`tr`).

## Global Configuration

- Configured in `src/payload.config.ts` with all 16 locales and `defaultLocale: 'en'`
- Uses `buildPayloadLocales()` from `src/lib/locales.ts` to generate locale configuration
- Locale labels generated from ISO 639-1 package with special case overrides
- Payload CMS automatically handles locale switching in the admin UI
- Fallback enabled to provide content in default locale when translations are missing

## Locale Configuration Features

### RTL Support
- Farsi (`fa`) locale has `rtl: true` set for proper right-to-left text rendering
- All other locales use the default left-to-right direction

### Fallback Locales
- All non-English locales have `fallbackLocale: 'en'` configured
- When a localized field has no value for a locale, it falls back to the English value
- English (`en`) has no fallback locale as it's the default

### Locale Labels
- Labels generated using the `iso-639-1` npm package
- Special case overrides for:
  - `pt-br`: "Brazilian Portuguese" (compound code not in ISO 639-1)
  - `fa`: "Farsi/Persian" (preferred label over ISO's "Persian")

## Admin UI Locale Filtering

The `filterAvailableLocales` function in `src/lib/access/filterAvailableLocales.ts` controls which locales appear in the admin UI locale selector based on user permissions:

### Filtering Rules
- **Unauthenticated requests**: Only English (for login page)
- **Admin managers**: All 16 locales
- **API clients**: All locales (filterAvailableLocales only applies to admin UI)
- **Regular managers**: English (always) + locales where they have at least one role assigned
- **Inactive managers**: Only English

### Example
A manager with roles `{ en: ['translator'], cs: ['meditations-editor'] }` would see:
- English (always included)
- Czech (has role assigned)

But would NOT see German, French, etc. (no roles assigned)

## Field-Level Localization

Collections with localized fields:
- **MeditationTags** and **SongTags**: `title` field is localized
- **Media**: `alt` and `credit` fields are localized
- **Songs**: `title` and `credit` fields are localized

## Meditations Locale Handling

The Meditations collection uses a different approach - each meditation belongs to a single locale:
- `locale` field: Select field with all 16 locale options
- Default value: 'en'
- Locale-based filtering implemented via a `beforeOperation` hook (`filterMeditationsByLocale` in `src/hooks/meditationHooks.ts`)
- The hook adds a `where` clause to `find` and `count` operations to filter by the meditation's `locale` field
- `findByID` always returns the specific document regardless of locale
- `locale=all` bypasses filtering and returns all meditations
- API queries respect `?locale=en` or `?locale=cs` parameters

## API Usage Examples

```bash
# Get English meditation tags
GET /api/meditation-tags?locale=en

# Get Czech meditations
GET /api/meditations?locale=cs

# Get songs with Czech titles
GET /api/songs?locale=cs
```
