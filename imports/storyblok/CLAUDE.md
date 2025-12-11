# Storyblok Import

Imports "Path Step" content from Storyblok CMS API into Payload's `lessons` collection.

## Environment

```bash
STORYBLOK_ACCESS_TOKEN=your-token  # Required
PAYLOAD_SECRET=your-secret
```

## Commands

```bash
pnpm import storyblok --dry-run     # Validate
pnpm import storyblok               # Full import
pnpm import storyblok --clear-cache # Re-download assets
```

## Field Mappings

| Storyblok Source | Payload Target | Notes |
|------------------|----------------|-------|
| `story.name` | `lessons.title` | Escape sequences converted to spaces |
| `story.slug` (e.g., "step-1") | `lessons.step` | Regex extracts step number |
| `Step_info[0].Unit_number` | `lessons.unit` | Maps to "Unit 1", "Unit 2", etc. |
| `Intro_quote` | `panels[0].quote` | CoverStoryBlock (first panel) |
| `Intro_stories[]` | `panels[]` | TextStoryBlock or VideoStoryBlock |
| `Audio_intro[0].Audio_track` | `lessons.introAudio` | FileAttachment (R2 audio) |
| `Audio_intro[0].Subtitles` | `lessons.introSubtitles` | JSON parsed subtitles |
| `Step_info[0].Step_Image` | `lessons.icon` | FileAttachment (R2 image) |
| `Meditation_reference[0]` | `lessons.meditation` | Lookup by "Step N" title |
| `Delving_deeper_article[0].Blocks` | `lessons.article` | Lexical rich text conversion |

## Panel Structure

Storyblok `Intro_stories` array → Payload `panels` array:

| Panel Type | blockType | Fields |
|------------|-----------|--------|
| Cover | `cover` | title, quote |
| Text | `text` | title, text, image (relationship) |
| Video | `video` | video (FileAttachment) |

**First panel must be CoverStoryBlock** with title and quote from Shri Mataji.

## Lexical Block Conversion

| Storyblok Block | Lexical Node |
|-----------------|--------------|
| `h1` | heading (level 1) |
| `DD_H2` | heading (level 2) |
| `DD_Paragraph` | paragraph |
| `DD_Quote` | quote |
| `DD_Image` | upload (images collection) |
| `DD_Main_video` | relationship (external-videos) |

## Output

- **Lessons** with panels array
- **Images** for panel backgrounds
- **External Videos** for video references
- **Files** for audio/icon attachments

## Troubleshooting

### "STORYBLOK_ACCESS_TOKEN not set"
Export the token: `export STORYBLOK_ACCESS_TOKEN=your-token`

### "Meditation not found for Step N"
Warning only - meditation relationship will be null. Import meditations separately.

### Asset download failures
Use `--clear-cache` to re-download. Check Storyblok asset URLs are accessible.
