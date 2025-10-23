# WeMeditate Rails Database Import

This directory contains the import script for migrating content from the Rails-based WeMeditate PostgreSQL database into Payload CMS.

## Overview

A comprehensive import script that migrates authors, categories, and pages from the WeMeditate Rails application database across 9 locales into the Payload CMS system.

**Script Location**: [`import.ts`](./import.ts)
**Source Data**: [`data.bin`](./data.bin) (PostgreSQL dump, ~2.4MB)

## Features

### ✅ Current Capabilities

- **PostgreSQL Integration**: Automatic database setup, restore from backup, and cleanup
- **Multi-Locale Support**: Imports content across all 9 supported locales (en, es, de, it, fr, ru, ro, cs, uk)
- **Resumable Import**: State tracking with `import-state.json` and ID mapping for safe interruption and resumption
- **Tag-Based Tracking**: All imported documents tagged with `import-wemeditate` for easy identification and cleanup
- **Collection Reset**: `--reset` flag for destructive cleanup before re-importing
- **Dry Run Mode**: `--dry-run` flag to validate setup without initializing Payload

### 📊 Import Statistics

| Source Table | Count | Target Collection | Tag |
|-------------|-------|-------------------|-----|
| `authors` | 25 | Authors | N/A |
| `categories` | 5 | PageTags | (category name) |
| `static_pages` | 31 | Pages | `static-page` |
| `articles` | 55 | Pages | `article` + article type + category |
| `promo_pages` | 29 | Pages | `promo` |
| `subtle_system_nodes` | 12 | Pages | `subtle-system` |
| `treatments` | 8 | Pages | `treatment` |

**Total**: ~160+ pages across 9 locales = ~1,440 potential documents

## Usage

### Prerequisites

1. **PostgreSQL**: Must be installed locally (`psql`, `createdb`, `pg_restore` commands available)
2. **Environment Variables**:
   - `DATABASE_URI` - MongoDB connection string for Payload
   - `PAYLOAD_SECRET` - Payload secret key
3. **Source Data**: `migration/wemeditate/data.bin` file must exist

### Commands

```bash
# Dry run (validates setup without importing)
npx tsx migration/wemeditate/import.ts --dry-run

# Full import
npx tsx migration/wemeditate/import.ts

# Reset all imported data and re-import
npx tsx migration/wemeditate/import.ts --reset

# Resume interrupted import
npx tsx migration/wemeditate/import.ts --resume

# Clear cache and start fresh
npx tsx migration/wemeditate/import.ts --clear-cache --reset
```

### Command Flags

- `--dry-run` - Validate setup and database without initializing Payload CMS
- `--reset` - Delete all previously imported documents before starting
- `--resume` - Continue from last saved state (loads `import-state.json`)
- `--clear-cache` - Delete cached files and state before starting

## Data Transformation

### Authors Collection

**Source**: `authors` + `author_translations` tables

**Mapping**:
- `name` (localized) → `name`
- `title` (localized) → `title`
- `text` (localized) → `description`
- `country_code` → `countryCode`
- `years_meditating` → `yearsMeditating`
- `image` (JSONB) → `image` relationship (future: download and upload)

### Categories → Page Tags

**Source**: `categories` + `category_translations` tables

**Mapping**:
- `name` (localized) → `title`
- `slug` (localized) → `name`

### Content Type Tags

Automatically created for each content type:
- `static-page`
- `article` (plus article type tags: `artwork`, `event`, `report`)
- `promo`
- `subtle-system`
- `treatment`

### Pages Collection

**Source**: `static_pages`, `articles`, `promo_pages`, `subtle_system_nodes`, `treatments` + their `*_translations` tables

**Mapping**:
- `name` (localized) → `title`
- `slug` (localized) → `slug`
- `published_at` (localized) → `publishAt`
- `state = 1` (published only)
- `author_id` → `author` relationship (for articles only)
- `category_id` → PageTag relationship (for articles only)
- `article_type` → Additional PageTag (for articles only)
- Content type → PageTag (all pages)

### Current Limitations

**Content Field**: Currently imported as empty. The `content` JSONB field contains EditorJS format that needs conversion to Lexical format (see Future Enhancements below).

## File Organization

```
migration/
├── wemeditate/
│   ├── import.ts              # Main import script
│   ├── data.bin              # PostgreSQL dump (source data)
│   └── README.md             # This file
└── cache/
    └── wemeditate/
        ├── import.log        # Detailed import log
        ├── import-state.json # Resumability state
        ├── id-mappings.json  # Source ID → Payload ID mappings
        └── assets/           # Downloaded files (future)
            ├── images/
            ├── audio/
            └── videos/
```

## Source Database Schema

### Key Tables

- `authors` - Author profiles
- `author_translations` - Localized author fields
- `categories` - Article categories
- `category_translations` - Localized category names
- `static_pages` - Static content pages
- `static_page_translations` - Localized static page content
- `articles` - Article pages with author/category relationships
- `article_translations` - Localized article content
- `promo_pages` - Promotional pages
- `promo_page_translations` - Localized promo content
- `subtle_system_nodes` - Subtle system educational content
- `subtle_system_node_translations` - Localized subtle system content
- `treatments` - Treatment/remedy pages
- `treatment_translations` - Localized treatment content
- `media_files` - Polymorphic media associations with JSONB file data

### Translation Structure

Each translation table contains:
- `locale` - ISO locale code (en, es, de, it, fr, ru, ro, cs, uk)
- `name` - Title/name
- `slug` - URL-friendly identifier
- `content` - JSONB EditorJS content blocks
- `published_at` - Publication date
- `state` - Publication state (1 = published)

## Future Enhancements

The following features are planned for follow-up implementations:

### 1. EditorJS to Lexical Conversion

Complex content block transformation for the `content` field:

| Source Block | Target | Notes |
|-------------|--------|-------|
| `paragraph` (type: text) | Lexical paragraph | Direct text mapping |
| `paragraph` (type: header) | Lexical heading | H1/H2 based on level |
| `textbox` (type: splash) | TextBoxBlock | style: `splash` |
| `textbox` (type: image, position: left) | TextBoxBlock | style: `leftAligned` |
| `textbox` (type: image, position: right) | TextBoxBlock | style: `rightAligned` |
| `textbox` (type: image, background: image, color: light) | TextBoxBlock | style: `overlay` |
| `textbox` (type: image, background: image, color: dark) | TextBoxBlock | style: `overlayDark` |
| `textbox` (type: text OR hero) | QuoteBlock | Map text field |
| `layout` | LayoutBlock | 1:1 style mapping |
| `media` | GalleryBlock | Download images → Media |
| `action` (type: form) | Lexical Relationship | Create Form document |
| `action` (type: button) | ButtonBlock | Map action/url fields |
| `vimeo` | Lexical Relationship | Create ExternalVideo |
| `catalog` (1 item) | Lexical Relationship | Single relationship |
| `catalog` (multiple) | GalleryBlock | Multiple relationships |
| `whitespace` | DROP | Ignored |

### 2. Media File Migration

- Download images from `https://assets.wemeditate.com/uploads/`
- Parse JSONB `file` field from `media_files` table
- Convert to WebP format using Sharp
- Upload to Payload Media collection
- Tag with `import-wemeditate`
- Create proper relationships in TextBoxBlock, LayoutBlock, GalleryBlock

### 3. Form Creation

- Parse `action` blocks with `type: "form"` and `form: "contact"|"signup"`
- Create Form documents via Form Builder plugin
- Infer field structure from form type:
  - Contact: name, email, message
  - Signup: email
- Link forms via Lexical Relationship nodes

### 4. External Video Integration

- Parse `vimeo` blocks with `vimeo_id`, `thumbnail`, `title`
- Check for existing ExternalVideo by `vimeoId`
- Create/update ExternalVideo documents
- Link via Lexical Relationship nodes

### 5. Catalog Block Handling

- Parse `catalog` blocks with `items` (IDs) and `type` (treatments/meditations)
- Map source IDs to imported document IDs:
  - Treatments → Pages with treatment tag
  - Meditations → Meditations by title match
- Single item → Lexical Relationship
- Multiple items → GalleryBlock

## Troubleshooting

### PostgreSQL Connection Issues

**Error**: `createdb: command not found`
- **Solution**: Install PostgreSQL locally
- macOS: `brew install postgresql`
- Ubuntu: `sudo apt-get install postgresql`

### Database Restore Errors

**Error**: `role "u12n90ajonnnjt" does not exist`
- **Solution**: This is normal - ownership warnings can be ignored
- The `--no-owner` flag handles this automatically

### Import Hangs or Fails

1. Check the log file: `migration/cache/wemeditate/import.log`
2. Verify environment variables are set: `DATABASE_URI`, `PAYLOAD_SECRET`
3. Try with `--clear-cache --reset` to start fresh
4. Check MongoDB is running and accessible

### Resuming After Interruption

The import automatically saves state. To resume:
```bash
npx tsx migration/wemeditate/import.ts --resume
```

## Development

### Testing Changes

```bash
# Test with dry run (doesn't initialize Payload)
npx tsx migration/wemeditate/import.ts --dry-run

# Test with single content type (modify script to comment out others)
npx tsx migration/wemeditate/import.ts

# Inspect cached state
cat migration/cache/wemeditate/import-state.json
cat migration/cache/wemeditate/id-mappings.json
```

### Adding New Transformations

1. Add transformation logic to appropriate `import*` method
2. Update ID mappings in `idMaps` interface
3. Add state tracking for resumability
4. Test with `--dry-run` first
5. Update this README with new capabilities

## Related Documentation

- [Import Script Template](../IMPORT_SCRIPT_TEMPLATE.md) - Template used to create this script
- [Storyblok Import](../storyblok/import.ts) - Similar import for Lessons collection
- [CLAUDE.md](../../CLAUDE.md) - Overall project documentation
