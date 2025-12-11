# Meditations Import

Imports meditation content from legacy PostgreSQL database.

## Prerequisite

**Run tags import first**:
```bash
pnpm import tags
```

The meditations import maps legacy tag names to predefined tags by slug. Without tags, tag mapping fails.

## Environment

```bash
PAYLOAD_SECRET=your-secret
STORAGE_BASE_URL=https://storage.googleapis.com/your-bucket  # For file downloads
```

## Commands

```bash
pnpm import meditations --dry-run     # Validate
pnpm import meditations               # Full import
pnpm import meditations --clear-cache # Re-download files
```

## Import Order

1. Creates 2 narrator records (male/female)
2. Maps legacy tags to predefined tags by slug
3. Imports frames with file attachments
4. Imports music with audio files
5. Imports meditations with audio, thumbnails, and frame relationships

## Source → Target Mappings

| Source | Target Collection | Notes |
|--------|-------------------|-------|
| Narrator index 0 | narrators | Female Narrator |
| Narrator index 1 | narrators | Male Narrator |
| `frames` + attachments | frames | Male/female variants |
| `musics` + attachments | music | Audio files |
| `meditations` + attachments | meditations | Audio + thumbnails |
| `keyframes` | meditations.frames | Timestamp array |

## Frame Category Mapping

| Legacy | Payload |
|--------|---------|
| `heart` | `anahat` |
| `mooladhara` | `mooladhara` |
| `swadhistan` | `swadhistan` |
| `nabhi` | `nabhi` |
| `void` | `void` |
| `vishuddhi` | `vishuddhi` |
| `agnya` | `agnya` |
| `sahasrara` | `sahasrara` |

## Tag Slug Mappings

Legacy tags are mapped to predefined slugs. If you see warnings:

**"No mapping found for legacy tag"**
- Add to `LEGACY_TO_MEDITATION_TAG_SLUG` or `LEGACY_TO_MUSIC_TAG_SLUG` in `import.ts`

**"Predefined tag slug not found"**
- Run `pnpm import tags` first

## Keyframe Processing

1. Filter by `media_type = 'Meditation'`
2. Select gender-appropriate frames (based on narrator)
3. Sort by timestamp
4. Remove duplicate timestamps
5. Output: `[{ id: frameId, timestamp: seconds }]`

## Troubleshooting

### "Failed to download" errors
- Check `STORAGE_BASE_URL` is correct
- Verify storage bucket permissions
- Some missing files are handled gracefully

### Tag mapping warnings
- Tags are case-insensitive (normalized to lowercase)
- Add missing mappings to the mapping constants

### Database errors
- Ensure PostgreSQL is running
- Check user has permission to create/drop databases
