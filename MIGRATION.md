# Database Migration: Cloudflare Storage

## Overview
This migration introduces Cloudflare-native storage and changes collection slugs. A database reset is required.

## Breaking Changes
- Collection slugs changed: `media` → `images`, `file-attachments` → `files`
- API endpoints changed: `/api/media` → `/api/images`, `/api/file-attachments` → `/api/files`
- URL format changed: Old local/S3 URLs → Cloudflare CDN URLs
- Storage system changed: Local/S3-compatible storage → Cloudflare-native services (Images, Stream, R2)

## New Storage Architecture

### Cloudflare Images (Image Storage)
- Automatic format optimization (WebP, AVIF)
- Dynamic image transformations via URL parameters
- Global CDN delivery
- Used by: `images` collection

### Cloudflare Stream (Video Storage)
- Automatic video transcoding
- HLS adaptive streaming
- Automatic thumbnail generation
- MP4 downloads for HTML5 video compatibility
- Used by: `frames` collection (for video frames)

### R2 Native Bindings (Audio & Files)
- Direct bucket access (not S3-compatible API)
- High performance with native integration
- Used by: `meditations`, `music`, `lessons`, `files` collections
- Public access via custom domain (CLOUDFLARE_R2_DELIVERY_URL)

## Local Development Reset

1. Stop dev server (if running)
2. Delete local database:
   ```bash
   rm local.db
   ```
3. Restart dev server with explicit port:
   ```bash
   PORT=4567 pnpm dev
   ```
4. PayloadCMS will auto-create new database with latest schema

## Production Database Reset

### Option 1: Delete Tables and Re-run Migrations (Recommended for Existing DB)

```bash
# Run database migrations to create fresh schema
pnpm run deploy:database
```

### Option 2: Create New D1 Database (Recommended for Clean Start)

1. Create new D1 database in Cloudflare dashboard:
   ```bash
   wrangler d1 create sahajcloud-new
   ```
2. Update `wrangler.toml` with new database ID:
   ```toml
   [[d1_databases]]
   binding = "DB"
   database_name = "sahajcloud"
   database_id = "new-database-id-here"
   ```
3. Run migrations on new database:
   ```bash
   pnpm run deploy:database
   ```
4. Deploy application:
   ```bash
   pnpm run deploy:prod
   ```
5. Delete old database after verification

## Production Deployment Checklist

### Prerequisites
- [ ] Cloudflare Images enabled in dashboard
- [ ] Cloudflare Stream enabled in dashboard
- [ ] API tokens created with appropriate permissions
- [ ] Secrets set via `wrangler secret put`

### Environment Configuration

Set the following secrets in Cloudflare Workers:

```bash
wrangler secret put CLOUDFLARE_API_KEY
wrangler secret put PAYLOAD_SECRET
wrangler secret put RESEND_API_KEY
```

Configure `wrangler.toml` variables:

```toml
[vars]
CLOUDFLARE_ACCOUNT_ID = "your-account-id"
CLOUDFLARE_IMAGES_DELIVERY_URL = "https://imagedelivery.net/<your-hash>"
CLOUDFLARE_STREAM_DELIVERY_URL = "https://customer-<your-code>.cloudflarestream.com"
CLOUDFLARE_R2_DELIVERY_URL = "https://assets.sydevelopers.com"
```

### Finding Cloudflare Credentials

**Account ID**:
1. Go to Cloudflare Dashboard → Account Home
2. Look in right sidebar under "Account ID"

**Images Delivery URL**:
1. Go to Images dashboard
2. Look at any delivery URL: `https://imagedelivery.net/<hash>/<image-id>/public`
3. Copy the base URL including the hash: `https://imagedelivery.net/<hash>`

**Stream Delivery URL**:
1. Go to Stream dashboard
2. Look at any video player URL: `https://customer-<code>.cloudflarestream.com/...`
3. Copy the base URL: `https://customer-<code>.cloudflarestream.com`

### Deployment Steps

1. **Database Migration**:
   ```bash
   pnpm run deploy:database
   ```

2. **Deploy Application**:
   ```bash
   pnpm run deploy:prod
   ```

3. **Verify Deployment**:
   - Check collections show correct slugs (images, files)
   - Test image upload to Cloudflare Images
   - Test video upload to Cloudflare Stream
   - Verify thumbnails display correctly
   - Check virtual fields populate URLs correctly

4. **Monitor Logs**:
   ```bash
   wrangler tail sahajcloud --format pretty
   ```

## Verification Checklist

After deployment, verify the following:

- [ ] Collections show correct slugs (`images`, `files` instead of `media`, `file-attachments`)
- [ ] Image uploads store Cloudflare Image IDs as filenames
- [ ] Video uploads store Cloudflare Stream IDs as filenames
- [ ] Thumbnails display for both images and videos in admin UI
- [ ] Virtual fields populate URLs correctly:
  - [ ] `images.url` → Cloudflare Images delivery URL
  - [ ] `frames.thumbnailUrl` → Cloudflare Images/Stream thumbnail URL
  - [ ] `frames.streamMp4Url` → Cloudflare Stream MP4 download URL
  - [ ] `meditations.url`, `music.url`, `lessons.url`, `files.url` → R2 URLs
- [ ] File operations work correctly:
  - [ ] Upload new image
  - [ ] Upload new video frame
  - [ ] Upload new audio file
  - [ ] Delete files (verify deletion from Cloudflare services)
- [ ] No errors in production logs (`wrangler tail`)

## Rollback Plan

If issues occur, rollback using git:

```bash
# Revert to previous commit
git revert <commit-hash>

# Or reset to previous state
git reset --hard <previous-commit>

# Force push to trigger redeployment
git push origin feat/cloudflare-native-storage --force
```

Then restore old database (if Option 2 was used):

1. Update `wrangler.toml` with old database ID
2. Deploy: `pnpm run deploy:prod`

## Support

For issues or questions:
- Check logs: `wrangler tail sahajcloud --format pretty`
- Review implementation plan: `IMPLEMENTATION_PLAN.md`
- Check Cloudflare dashboard for service status
- Verify environment variables and secrets are set correctly

---

**Migration Date**: 2025-12-03
**Issue**: #75
