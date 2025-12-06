# Localization Architecture

The application supports comprehensive localization for 16 locales: English (`en`), Spanish (`es`), German (`de`), Italian (`it`), French (`fr`), Russian (`ru`), Romanian (`ro`), Czech (`cs`), Ukrainian (`uk`), Greek (`el`), Armenian (`hy`), Polish (`pl`), Brazilian Portuguese (`pt-br`), Farsi/Persian (`fa`), Bulgarian (`bg`), and Turkish (`tr`).

## Global Configuration

- Configured in `src/payload.config.ts` with all 16 locales and `defaultLocale: 'en'`
- Payload CMS automatically handles locale switching in the admin UI
- Fallback enabled to provide content in default locale when translations are missing

## Field-Level Localization

Collections with localized fields:
- **MeditationTags** and **MusicTags**: `title` field is localized
- **Media**: `alt` and `credit` fields are localized
- **Music**: `title` and `credit` fields are localized

## Meditations Locale Handling

The Meditations collection uses a different approach - each meditation belongs to a single locale:
- `locale` field: Select field with options for 'en' (English) and 'cs' (Czech)
- Default value: 'en'
- Locale-based filtering implemented via `beforeFind` and `beforeCount` hooks
- API queries respect `?locale=en` or `?locale=cs` parameters

## API Usage Examples

```bash
# Get English meditation tags
GET /api/meditation-tags?locale=en

# Get Czech meditations
GET /api/meditations?locale=cs

# Get music with Czech titles
GET /api/music?locale=cs
```
