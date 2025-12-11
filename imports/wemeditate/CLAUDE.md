# WeMeditate Import

Imports content from Rails-based WeMeditate PostgreSQL database into Payload CMS.

## Dual-Database Architecture

**Important**: This import uses TWO separate databases:

1. **PostgreSQL (Source - temporary)**
   - Created from `data.bin` (Rails database dump)
   - Used to READ legacy WeMeditate content
   - Automatically cleaned up after import

2. **SQLite/D1 (Target - Payload)**
   - Current Payload database
   - Where imported content is WRITTEN
   - Configured in `payload.config.ts`

## Prerequisites

- PostgreSQL installed (`psql`, `createdb`, `pg_restore` commands available)
- `imports/wemeditate/data.bin` file exists
- `PAYLOAD_SECRET` environment variable set

## Commands

```bash
pnpm import wemeditate --dry-run     # Validate
pnpm import wemeditate               # Full import
pnpm import wemeditate --clear-cache # Fresh start
```

## Source Tables → Target Collections

| PostgreSQL Table | Payload Collection | Tag Applied |
|------------------|-------------------|-------------|
| `authors` | authors | - |
| `categories` | page-tags | - |
| `static_pages` | pages | `static-page` |
| `articles` | pages | `article` + category |
| `promo_pages` | pages | `promo` |
| `subtle_system_nodes` | pages | `subtle-system` |
| `treatments` | pages | `treatment` |

## Field Mappings

### Authors
| Source | Target | Notes |
|--------|--------|-------|
| `author_translations.name` | `authors.name` | Localized |
| `author_translations.title` | `authors.title` | Localized |
| `author_translations.text` | `authors.description` | Localized |
| `authors.country_code` | `authors.countryCode` | ISO code |
| `authors.years_meditating` | `authors.yearsMeditating` | Number |

### Pages
| Source | Target | Notes |
|--------|--------|-------|
| `*_translations.name` | `pages.title` | Localized |
| `*_translations.slug` | `pages.slug` | Auto-generated on conflict |
| `*_translations.published_at` | `pages.publishAt` | Date |
| `*_translations.content` | `pages.content` | EditorJS → Lexical |
| `articles.author_id` | `pages.author` | Relationship |
| `articles.category_id` | `pages.tags` | PageTag relationship |

## Multi-Locale Support

16 locales: `en`, `es`, `de`, `it`, `fr`, `ru`, `ro`, `cs`, `uk`, `el`, `hy`, `pl`, `pt-br`, `fa`, `bg`, `tr`

Translation tables (`*_translations`) contain locale-specific content.

## WeMeditate Web Settings

The import also updates the `we-meditate-web-settings` global:

| Setting | Type | Description |
|---------|------|-------------|
| Static Pages | relationship | homePage, musicPage, classesPage, subtleSystemPage, techniquesPage, inspirationPage |
| Navigation | relationship[] | featuredPages, footerPages |
| Chakras | relationship | mooladhara, kundalini, swadhistan, nabhi, void, anahat, vishuddhi, agnya, sahasrara |
| Channels | relationship | left, right, center |
| Tags | relationship[] | musicPageTags, inspirationPageTags, techniquePageTag |

## Content Conversion

EditorJS blocks → Lexical format via `lexicalConverter.ts`:

| EditorJS Block | Lexical Node |
|----------------|--------------|
| `paragraph` | paragraph |
| `header` | heading |
| `list` | list |
| `image` | upload |
| `vimeo`/`youtube` | relationship (lectures) |

## Troubleshooting

### "createdb: command not found"
Install PostgreSQL: `brew install postgresql` (macOS)

### "role does not exist" warning
Normal - ownership warnings from pg_restore can be ignored.

### Database cleanup issues
```bash
dropdb temp_wemeditate_import
```
