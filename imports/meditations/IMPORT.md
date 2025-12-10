# Meditations Import

This script imports meditation content from the Heroku Postgres dump (`data.bin`) into Payload CMS. It's specifically designed for the exact data structure found in the Rails application.

## Prerequisites

**IMPORTANT**: Run the tags import script first to create the predefined meditation and music tags:

```bash
pnpm run import tags
```

The meditations import maps legacy tag names to these predefined tags by slug. Without running the tags import first, tag mapping will fail.

## What It Does

1. **Creates temp database** from your `data.bin` dump file
2. **Imports data in order**:
   - Creates 2 narrator records (male/female)
   - Maps legacy tags to predefined tags (by slug)
   - Imports frames with file attachments + transforms comma-separated tags
   - Imports music with audio file attachments
   - Imports meditations with audio + thumbnail files + frame relationships

3. **Handles file transfers** from Rails Active Storage to Payload
4. **Maps relationships** correctly (keyframes → meditation frames, etc.)

## Data Transformation

### From Rails Structure:
- `tags` → Mapped to predefined Payload tags by slug (requires tags import first)
- `frames.tags` (comma-separated) → Payload tag relationships
- `frames` + Active Storage → Payload frames with uploaded files
- `musics` + Active Storage → Payload music with uploaded files
- `meditations` + Active Storage → Payload meditations with uploaded files
- `keyframes` → Payload meditation frames array with timestamps
- Rails narrator (0/1) → Payload narrator relationships

### File Handling:
- Downloads from Google Cloud Storage using blob keys
- Re-uploads to Payload's media system
- Handles audio files for music/meditations
- Handles images/videos for frames
- Handles thumbnails for meditations

## Setup

1. **Required Environment Variables**:
```env
# Storage URL for downloading files (update with your actual bucket)
STORAGE_BASE_URL=https://storage.googleapis.com/YOUR_BUCKET_NAME

# Standard Payload environment
DATABASE_URI=mongodb://localhost:27017/payload
PAYLOAD_SECRET=your-secret-key
```

2. **Ensure PostgreSQL is available** (for temp database creation)

3. **Place your dump file** at `imports/meditations/data.bin`

## Usage

```bash
# First, import predefined tags (required)
pnpm run import tags

# Then run the meditations import
pnpm run import meditations

# With flags
pnpm run import meditations --dry-run
pnpm run import meditations --reset
```

## What Gets Imported

Based on your actual data dump:

- **~20 tags** (tired, bored, fulfilled, harmony, flute, etc.)
- **~50 frames** (agnya, kundalini, clearing, etc. with image/video files)
- **~20 meditations** (published only) with audio files and frame relationships
- **~10 music tracks** with audio files
- **File attachments** downloaded and re-uploaded to Payload

## File URL Configuration

⚠️ **IMPORTANT**: You need to update the `STORAGE_BASE_URL` environment variable with your actual Google Cloud Storage bucket URL or wherever your files are hosted.

The script currently uses:
```typescript
const baseUrl = process.env.STORAGE_BASE_URL || 'https://storage.googleapis.com/YOUR_BUCKET'
const fileUrl = `${baseUrl}/${storageKey}`
```

## Troubleshooting

### Tag mapping warnings
- **"No mapping found for legacy tag"**: Add the legacy tag name to `LEGACY_TO_MEDITATION_TAG_SLUG` or `LEGACY_TO_MUSIC_TAG_SLUG` in `import.ts`
- **"Predefined tag slug not found"**: Run `pnpm run import tags` first to create the predefined tags
- Tags are case-insensitive - the script normalizes names to lowercase for matching

### "Failed to download" errors
- Check that `STORAGE_BASE_URL` is correct
- Verify file permissions on your storage bucket
- Some files might be missing - this is handled gracefully

### Database errors
- Ensure PostgreSQL is running
- Check that user has permission to create/drop databases
- Ensure MongoDB is running for Payload

### Upload errors
- Check Payload configuration
- Verify storage permissions
- Check file size limits

## After Import

1. **Check the admin panel** to verify data was imported correctly
2. **Test file access** to ensure media files are working
3. **Review frame relationships** in meditations
4. **Clean up** - the temp database and files are automatically removed

## Differences from Generic Migration

This script is much simpler than the generic migration tool because:

- ✅ **No schema analysis** - we know the exact structure
- ✅ **No interactive mapping** - field mappings are hardcoded
- ✅ **No complex validation** - data is trusted from your existing app
- ✅ **Specific to your data** - handles Rails Active Storage patterns
- ✅ **Smaller dataset** - optimized for ~100 records vs thousands
- ✅ **Direct database import** - uses pg_restore instead of live connection

## Recovery

If something goes wrong:
1. The temp database is automatically cleaned up
2. You can re-run the script multiple times
3. Check Payload admin to see what was successfully imported
4. Individual collections can be cleared from Payload admin if needed