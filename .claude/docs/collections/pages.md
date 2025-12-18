# Pages Collection & Rich Text Architecture

The **Pages Collection** uses Payload's Lexical rich text editor with embedded blocks, enabling editors to create flexible page content with inline formatting and block components.

## Pages Collection Structure

- **Location**: `src/collections/content/Pages.ts`
- **Core Fields**:
  - `title` (text, required, localized) - Page title
  - `slug` (text, unique, auto-generated) - URL-friendly identifier generated from title using built-in slugField
  - `content` (richText, localized) - Main content area using Lexical editor with embedded blocks
  - `_status` (draft | published) - Publication status managed by PayloadCMS drafts system
  - `author` (relationship, optional) - Relationship to authors collection
  - `tags` (relationship, hasMany, optional) - Relationship to page-tags collection for flexible tag management

## Embedded Block Components

**Location**: `src/blocks/pages/`

The system provides 6 block types that can be embedded within the rich text editor:

### 1. TextBoxBlock (`TextBoxBlock.ts`)

Styled text box component:
- `style` (select, required, default: 'splash') - Display style: splash, leftAligned, rightAligned, overlay
- `title` (text, optional, localized) - Block title
- `text` (richText, required, localized) - Main content with 250-character limit validation
- `image` (upload relationship to Media, optional) - Accompanying image
- `link` (text, optional) - URL field for external links
- `actionText` (text, optional, localized) - Call-to-action text for links

### 2. ButtonBlock (`ButtonBlock.ts`)

Simple button component:
- `text` (text, localized) - Button text
- `url` (text) - Button link URL

### 3. LayoutBlock (`LayoutBlock.ts`)

Multi-item layout component:
- `style` (select, required) - Layout style: grid, columns, accordion
- `items` (array) - Collection of items, each containing:
  - `image` (upload relationship to Media, optional)
  - `title` (text, optional, localized)
  - `text` (richText, optional, localized)
  - `link` (text, optional) - URL field

### 4. GalleryBlock (`GalleryBlock.ts`)

Content gallery component:
- `title` (text, optional, localized) - Gallery title
- `collectionType` (select, required) - Target collection: media, meditations, pages
- `items` (relationship, hasMany, max: 10) - Related content items with dynamic collection filtering

### 5. QuoteBlock (`QuoteBlock.ts`)

Quote component:
- `text` (text, required) - Quote text
- `author` (text, optional) - Quote author
- `subtitle` (text, optional) - Additional context or subtitle

### 6. CatalogBlock (`CatalogBlock.ts`)

Content catalog component:
- `items` (relationship, hasMany, min: 3, max: 6) - Related content items
- Supports meditations and pages collections
- Displays curated list of related content

## Key Features

- **Lexical Editor Integration**: Full-featured editor with formatting options and embedded blocks
- **Drafts System**: PayloadCMS built-in drafts with autosave (60s interval), version history (3 per doc), and scheduled publishing
- **Per-Locale Publishing**: Uses PayloadCMS native per-locale publishing via `publishSpecificLocale` API option (tracks `published_locale` in versions table)
- **Character Count Validation**: TextBoxBlock text field enforces 250-character limit with HTML stripping
- **Gallery Block Validation**: Maximum 10 items per gallery with conditional relationship filtering
- **Localization Support**: All text content fields support 16 locales (en, es, de, it, fr, ru, ro, cs, uk, el, hy, pl, pt-br, fa, bg, tr)
- **Slug Generation**: Uses built-in slugField for automatic slug generation from title
- **Live Preview**: Real-time preview integration with We Meditate Web frontend (configurable via `WEMEDITATE_WEB_URL` environment variable)

## Testing Coverage

- **Integration Tests**: `tests/int/pages.int.spec.ts` with comprehensive test cases
- **Test Data Factories**: Enhanced `testData.ts` with `createPage()` helper function
- **Block Validation**: Tests for character limits, item counts, and block structure validation
