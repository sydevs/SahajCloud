# Simple Heroku Postgres Import

This script is specifically designed to import the Heroku Postgres dump (`data.bin`) into Payload CMS. It's simplified and targeted for the exact data structure found in your Rails application.

## What It Does

1. **Creates temp database** from your `data.bin` dump file
2. **Imports data in order**:
   - Creates 2 narrator records (male/female)
   - Imports tags (individual tags from the `tags` table)
   - Imports frames with file attachments + transforms comma-separated tags
   - Imports music with audio file attachments
   - Imports meditations with audio + thumbnail files + frame relationships

3. **Handles file transfers** from Rails Active Storage to Payload
4. **Maps relationships** correctly (keyframes → meditation frames, etc.)

## Data Transformation

### From Rails Structure:
- `tags` → Payload tags (1:1, no transformation needed)
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

3. **Place your dump file** at `migration/meditations/data.bin`

## Usage

```bash
# Run the simplified import
pnpm tsx migration/meditations/import.ts

# With flags
pnpm tsx migration/meditations/import.ts --dry-run
pnpm tsx migration/meditations/import.ts --reset
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