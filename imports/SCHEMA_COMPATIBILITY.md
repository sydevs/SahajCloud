# Schema Compatibility Guide

This document describes the mappings between legacy source databases and Payload CMS collections for each import script.

## Overview

| Import Script | Source | Target Collections |
|---------------|--------|-------------------|
| Storyblok | Storyblok CMS API | lessons, images, external-videos, files |
| WeMeditate | PostgreSQL Rails DB | pages, authors, page-tags, images, external-videos, forms |
| Meditations | PostgreSQL Meditations DB | meditations, frames, narrators, music, meditation-tags, music-tags, images |
| Tags | Cloudinary CDN | meditation-tags, music-tags |

---

## Storyblok → Lessons

**Source**: Storyblok CMS HTTP API (Path/PathSteps content)
**Target**: `lessons` collection

### Field Mappings

| Storyblok Source | Payload Target | Transformation |
|-----------------|----------------|----------------|
| `story.name` | `lessons.title` | Escape sequences (`\n`) converted to spaces |
| `story.slug` (e.g., "step-1") | `lessons.step` | Regex extraction of step number |
| `story.content.Step_info[0].Unit_number` | `lessons.unit` | Maps to "Unit 1", "Unit 2", etc. |
| `story.content.Intro_quote` | `lessons.panels[0].quote` | CoverStoryBlock, first panel |
| `story.content.Intro_stories[]` | `lessons.panels[]` | TextStoryBlock or VideoStoryBlock |
| `story.content.Audio_intro[0].Audio_track` | `lessons.introAudio` | FileAttachment (R2 audio) |
| `story.content.Audio_intro[0].Subtitles` | `lessons.introSubtitles` | JSON parsed subtitles |
| `story.content.Step_info[0].Step_Image` | `lessons.icon` | FileAttachment (R2 image) |
| `story.content.Meditation_reference[0]` | `lessons.meditation` | Lookup by "Step N" title |
| `story.content.Delving_deeper_article[0].Blocks` | `lessons.article` | Lexical rich text conversion |

### Panel Structure

Storyblok `Intro_stories` array maps to Payload `panels` array:

| Storyblok Field | Payload Panel Field | Notes |
|-----------------|---------------------|-------|
| `Title` | `panel.title` | Text field |
| `Text` | `panel.text` | Escape sequences converted |
| `Image.url` | `panel.image` | Creates image in `images` collection |
| `Video.url` | `panel.video` | FileAttachment, created post-lesson |

### Lexical Block Conversion

| Storyblok Block | Lexical Node Type |
|-----------------|-------------------|
| `h1` | heading (level 1) |
| `DD_H2` | heading (level 2) |
| `DD_Paragraph` | paragraph |
| `DD_Quote` | quote |
| `DD_Image` | upload (images collection) |
| `DD_Main_video` | relationship (external-videos) |

---

## WeMeditate Rails → Pages/Authors/PageTags

**Source**: PostgreSQL Rails Database (`data.bin` dump)
**Target**: `pages`, `authors`, `page-tags`, `images`, `external-videos`, `forms`

### Authors Table

| PostgreSQL Source | Payload Target | Notes |
|-------------------|----------------|-------|
| `authors.id` | (internal mapping) | Source ID for relationships |
| `authors.country_code` | `authors.countryCode` | ISO country code |
| `authors.years_meditating` | `authors.yearsMeditating` | Number field |
| `author_translations.name` | `authors.name` | Localized (16 locales) |
| `author_translations.title` | `authors.title` | Localized |
| `author_translations.description` | `authors.description` | Localized |

### Categories → Page Tags

| PostgreSQL Source | Payload Target | Notes |
|-------------------|----------------|-------|
| `categories.id` | (internal mapping) | Source ID |
| `category_translations.name` | `page-tags.title` | Localized |
| `category_translations.slug` | `page-tags.slug` | Auto-generated from title |

### Content Tables → Pages

Multiple PostgreSQL tables map to the `pages` collection:

| PostgreSQL Table | Payload `pages` | Additional Tags |
|------------------|-----------------|-----------------|
| `static_pages` | title, slug, content | `static-page` |
| `articles` | title, slug, content, author | `article`, category tag |
| `promo_pages` | title, content | `promo` |
| `subtle_system_nodes` | title, slug, content | `subtle-system` |
| `treatments` | title, slug, content | `treatment` |

### Page Field Mappings

| PostgreSQL Source | Payload Target | Transformation |
|-------------------|----------------|----------------|
| `{table}_translations.name` | `pages.title` | Localized |
| `{table}_translations.slug` | `pages.slug` | Auto-generated on conflict |
| `{table}_translations.published_at` | `pages.publishAt` | Optional date |
| `{table}_translations.content` | `pages.content` | EditorJS → Lexical conversion |
| `articles.author_id` | `pages.author` | Relationship lookup |
| `articles.category_id` | `pages.tags` | Adds category as page-tag |

### Content Conversion (EditorJS → Lexical)

| EditorJS Block | Lexical Node |
|----------------|--------------|
| `paragraph` | paragraph |
| `header` | heading (level from data) |
| `list` | list (ordered/unordered) |
| `image` | upload (images collection) |
| `vimeo` | relationship (external-videos) |
| `youtube` | relationship (external-videos) |

---

## Meditations DB → Meditations/Frames/Music

**Source**: PostgreSQL Meditations Database (`data.bin` dump)
**Target**: `meditations`, `frames`, `narrators`, `music`, `meditation-tags`, `music-tags`, `images`

### Narrators

| Source | Payload Target | Notes |
|--------|----------------|-------|
| Index 0 | `narrators.name = "Female Narrator"` | `gender = female` |
| Index 1 | `narrators.name = "Male Narrator"` | `gender = male` |

### Tags Table

Tags are split based on usage in `taggings` table:

| PostgreSQL Source | Payload Collection | Condition |
|-------------------|-------------------|-----------|
| `tags.name` | `meditation-tags.title` | `taggable_type = 'Meditation'` |
| `tags.name` | `music-tags.title` | `taggable_type = 'Music'` |

### Frames Table

| PostgreSQL Source | Payload Target | Notes |
|-------------------|----------------|-------|
| `frames.id` | (mapping: `{id}_male`, `{id}_female`) | Separate male/female variants |
| `frames.category` | `frames.category` | Mapped: `heart` → `anahat` |
| `frames.tags` | `frames.tags` | Comma-separated → multi-select |
| Male attachment | `frames.imageSet = 'male'` | Downloaded and uploaded |
| Female attachment | `frames.imageSet = 'female'` | Downloaded and uploaded |

### Frame Category Mapping

| Legacy Category | Payload Category |
|-----------------|------------------|
| `heart` | `anahat` |
| `mooladhara` | `mooladhara` |
| `swadhistan` | `swadhistan` |
| `nabhi` | `nabhi` |
| `void` | `void` |
| `vishuddhi` | `vishuddhi` |
| `agnya` | `agnya` |
| `sahasrara` | `sahasrara` |

### Music Table

| PostgreSQL Source | Payload Target | Notes |
|-------------------|----------------|-------|
| `musics.id` | (internal mapping) | Source ID |
| `musics.title` | `music.title` | Localized to 'en' |
| `musics.credit` | `music.credit` | Localized to 'en' |
| `musics.duration` | `music.duration` | Number (seconds) |
| Taggings (Music) | `music.tags` | Lookup music-tag IDs |
| Audio attachment | (file upload) | Downloaded, uploaded |

### Meditations Table

| PostgreSQL Source | Payload Target | Notes |
|-------------------|----------------|-------|
| `meditations.id` | (internal mapping) | Source ID |
| `meditations.title` | `meditations.title` | Text field |
| `meditations.title` + duration | `meditations.slug` | Unique: `{slug}-{duration}` |
| `meditations.duration` | `meditations.duration` | Seconds |
| `meditations.published` | `meditations.publishAt` | true → today's date |
| `meditations.narrator` (index) | `meditations.narrator` | 0 → male, 1 → female |
| Taggings (Meditation) | `meditations.tags` | Lookup meditation-tag IDs |
| `meditations.music_tag` | `meditations.musicTag` | Lookup by name |
| Audio attachment | (file upload) | Downloaded, uploaded |
| Art attachment | `meditations.thumbnail` | Image in `images` collection |
| `keyframes` | `meditations.frames` | Array of `{id, timestamp}` |

### Keyframes Processing

1. Filter by `media_type = 'Meditation'`
2. Select gender-appropriate frames (based on narrator)
3. Sort by timestamp
4. Validate frame IDs exist
5. Remove duplicate timestamps
6. Output: `[{ id: frameId, timestamp: seconds }]`

---

## Tags Import → MeditationTags/MusicTags

**Source**: Cloudinary CDN (SVG assets)
**Target**: `meditation-tags`, `music-tags`

### Meditation Tags (24 predefined)

| Data Source | Payload Target | Notes |
|-------------|----------------|-------|
| `MEDITATION_TAGS[].title` | `meditation-tags.title` | User state descriptions |
| `MEDITATION_TAGS[].slug` | `meditation-tags.slug` | Auto-generated, unique |
| `MEDITATION_TAGS[].color` | `meditation-tags.color` | Hex color (e.g., #FFD591) |
| `MEDITATION_TAGS[].iconUrl` | (file upload) | SVG with colors → currentColor |

### Music Tags (4 predefined)

| Data Source | Payload Target | Notes |
|-------------|----------------|-------|
| `MUSIC_TAGS[].title` | `music-tags.title` | Music category |
| `MUSIC_TAGS[].slug` | `music-tags.slug` | Auto-generated |
| `MUSIC_TAGS[].iconUrl` | (file upload) | SVG with colors → currentColor |

### SVG Processing

- Download from Cloudinary URL
- Cache locally in `imports/cache/tags/assets/`
- Convert ALL hex colors (`#RRGGBB`, `#RGB`) to `currentColor`
- Upload as SVG file attachment

---

## Common Patterns

### Locale Support

| Import | Locales |
|--------|---------|
| Storyblok | `en` only |
| WeMeditate | All 16 (en, es, de, it, fr, ru, ro, cs, uk, el, hy, pl, pt-br, fa, bg, tr) |
| Meditations | `en` only |
| Tags | `en` only |

### File Upload Format

All imports use Payload's buffer-based upload:

```typescript
{
  data: Buffer.from(content),
  mimetype: 'image/svg+xml' | 'audio/mpeg' | 'image/webp',
  name: filename,
  size: buffer.length
}
```

### Relationship Mapping Strategy

1. **In-memory maps**: Store `sourceId → payloadId`
2. **Cache persistence**: Some scripts save to `imports/cache/*/id-mappings.json`
3. **Lookup methods**: By title, slug, or direct ID matching

### Database Architecture

| Import | Source Database | Target Database |
|--------|-----------------|-----------------|
| Storyblok | HTTP API (no DB) | Payload SQLite/D1 |
| WeMeditate | PostgreSQL (temporary) | Payload SQLite/D1 |
| Meditations | PostgreSQL (temporary) | Payload SQLite/D1 |
| Tags | HTTP (Cloudinary) | Payload SQLite/D1 |

PostgreSQL databases are restored from `data.bin` files, used for reading only, then dropped after import.
