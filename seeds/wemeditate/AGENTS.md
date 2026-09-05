# WeMeditate Import

Imports content from the Rails-based WeMeditate PostgreSQL database into
Payload CMS.

## Two separate databases

This import reads from one database and writes to another:

1. **Source (temporary PostgreSQL)** — restored from `data.bin` (a Rails
   database dump). Holds the legacy WeMeditate content. Cleaned up
   automatically after the import.
2. **Target (Payload's PostgreSQL)** — the live app database, configured in
   `payload.config.ts`. Where the imported content lands.

## Prerequisites

- PostgreSQL installed (`psql`, `createdb`, `pg_restore` commands available)
- `seeds/wemeditate/data.bin` exists
- `PAYLOAD_SECRET` environment variable set

## Commands

```bash
pnpm seed wemeditate --dry-run     # Validate
pnpm seed wemeditate               # Full import
pnpm seed wemeditate --clear-cache # Fresh start
```

## Source tables → target collections

| PostgreSQL Table | Payload Collection | Tag Applied |
|------------------|-------------------|-------------|
| `authors` | authors | - |
| `categories` | page-tags | - |
| `static_pages` | pages | `static-page` |
| `articles` | pages | `article` + category |
| `promo_pages` | pages | `promo` |
| `subtle_system_nodes` | pages | `subtle-system` |
| `treatments` | pages | `treatment` |

## Field mappings

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

## Multi-locale support

19 locales: `en`, `es`, `de`, `it`, `fr`, `ru`, `ro`, `cs`, `uk`, `el`, `hy`,
`pl`, `pt-BR`, `fa`, `bg`, `tr`, `en-AU`, `hu`, `nl`.

Translation tables (`*_translations`) hold the locale-specific content.

## WeMeditate Web settings

The import also updates the `we-meditate-web-settings` global:

| Setting | Type | Description |
|---------|------|-------------|
| Static Pages | relationship | homePage, musicPage, classesPage, subtleSystemPage, techniquesPage, inspirationPage |
| Navigation | relationship[] | featuredPages, footerPages |
| Chakras | relationship | mooladhara, kundalini, swadhistan, nabhi, void, anahat, vishuddhi, agnya, sahasrara |
| Channels | relationship | left, right, center |

## Content conversion

EditorJS blocks convert to Lexical format via `lexicalConverter.ts`:

| EditorJS Block | Lexical Node |
|----------------|--------------|
| `paragraph` | paragraph |
| `header` | heading |
| `list` | list |
| `image` | upload |
| `vimeo` | relationship (lectures). Each unique `vimeo_id` seeds one Lecture via the `populateFromNirmalaVidya` create hook (a synchronous NV API call). YouTube blocks are dropped, with a warning. |

## Troubleshooting

**"createdb: command not found"** — install PostgreSQL:
`brew install postgresql` (macOS).

**"role does not exist" warning** — normal. `pg_restore` ownership warnings
are safe to ignore.

**Database cleanup issues**
```bash
dropdb temp_wemeditate_import
```
