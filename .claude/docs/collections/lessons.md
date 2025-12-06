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
- `panels` (array, required, min 1) - Story panels with different block types:
  - **Cover Panel** (`cover` blockType) - Title and quote from Shri Mataji
  - **Text Panel** (`text` blockType) - Title, text content, and image
  - **Video Panel** (`video` blockType) - Video content with FileAttachment

### Audio & Content
- `introAudio` (FileAttachment field, optional) - Audio introduction to the lesson
- `introSubtitles` (json, optional) - Subtitles for the intro audio in JSON format
- `meditation` (relationship to Meditations, optional) - Related guided meditation for practice
- `article` (richText, localized, optional) - Deep dive article content using Lexical editor with QuoteBlock support

### Appearance Tab
- `unit` (select, required) - Unit selection: "Unit 1", "Unit 2", "Unit 3", "Unit 4"
- `step` (number, required) - Step number within the unit
- `icon` (relationship to Files, optional) - Step icon image

## Features

- Multiple panels for structured storytelling with different block types
- Optional audio introduction with JSON subtitle support
- Optional relationship to existing meditation for guided practice
- Localized rich text article field for deep dive explanations (not a relationship to Pages)
- Unit-based organization (Unit 1-4) with step numbering
- Soft delete support (trash functionality)
- Version control and draft support

## Key Implementation Notes

- Uses `permissionBasedAccess()` for consistent access control
- First panel must be a Cover Panel with title and quote (validated)
- Panels use union block types for flexible content structure: CoverStoryBlock, TextStoryBlock, VideoStoryBlock
- File attachments (via Files collection) for introAudio and icon support cascade deletion via ownership system
- Article field is a rich text field within the Lesson, not a relationship to the Pages collection
