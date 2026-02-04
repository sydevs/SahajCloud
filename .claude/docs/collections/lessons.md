# Lessons Collection Architecture

The Lessons collection (labeled as "Path Steps" in the admin UI) provides meditation lesson organization with individual path steps.

## Lessons Collection

- **Purpose**: Individual meditation lessons with audio content and visual panels
- **Collection Slug**: `lessons`
- **Admin Labels**: "Path Step" (singular) / "Path Steps" (plural)

## Fields

### Basic Information
- `title` (text, required) - Lesson name

### Story Panels
- `panels` (array, required, min 1) - Story panels with inline fields:
  - `title` (text, optional) - Panel title
  - `text` (textarea, optional) - Panel text content
  - `media` (upload to files, optional) - Image or video for the panel
  - `subtitles` (json, optional) - Subtitles for video media (shown when media exists)

### Audio & Content
- `introAudio` (upload to files, optional) - Audio introduction to the lesson
- `introSubtitles` (json, optional) - Subtitles for the intro audio in JSON format
- `meditation` (relationship to Meditations, optional) - Related guided meditation for practice
- `article` (richText, localized, optional) - Deep dive article content using Lexical editor with QuoteBlock support

### Appearance Tab
- `unit` (select, required) - Unit selection: "Unit 1", "Unit 2", "Unit 3", "Unit 4"
- `step` (number, required) - Step number within the unit
- `icon` (relationship to Images, optional) - Step icon image

## Features

- Flexible array-based panels for structured storytelling
- All panel media (images and videos) stored in the Files collection
- Optional audio introduction with JSON subtitle support
- Optional relationship to existing meditation for guided practice
- Localized rich text article field for deep dive explanations (not a relationship to Pages)
- Unit-based organization (Unit 1-4) with step numbering
- Soft delete support (trash functionality)

## Key Implementation Notes

- Access control is applied automatically by `accessPlugin` (no manual configuration needed)
- Panels are simple array items with inline fields (no block types)
- Media field accepts both images and videos from the Files collection
- Subtitles field is conditionally shown when media is present
- File attachments (via Files collection) for introAudio support cascade deletion via ownership system
- Article field is a rich text field within the Lesson, not a relationship to the Pages collection
- The `meditation` relationship field uses `filterOptions: { type: { equals: 'lesson' } }` to restrict selection to meditations with type `'lesson'`. When creating meditations for test lessons, set `type: 'lesson'`.
