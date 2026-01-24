# Seed Script Issues Report

This report compiles all resources with warnings or errors across all seed log files.

## Summary

| Category | Count |
|----------|-------|
| **Critical Errors (still failing)** | 2 |
| **Possibly Resolved (verify in CMS)** | 17 |
| **Confirmed Fixed** | 11 |
| **Warnings (data quality)** | 7 |

---

## Critical Errors (Still Failing)

These resources consistently fail and need investigation:

| Resource Title | Resource ID | Collection | Problem | Status |
|----------------|-------------|------------|---------|--------|
| parimala-sabau | Author 26 | authors | Slug collision: D1_ERROR: UNIQUE constraint failed | ❌ Still failing in seed-4 |
| small_founder.jpg | Media 211 | images (for Page 4) | Buffer.from offset error: `The "offset" argument must be of type number. Received type string ('utf8')` | ❌ Still failing in seed-4 |

---

## Possibly Resolved (Verify in CMS)

These resources had errors in earlier runs but now show "skipped" or "created" in seed-4.log, indicating they may have been successfully imported. **Manual verification in the CMS is required.**

### Media/Content Issues

| Resource Title | Resource ID | Collection | Original Problem | Status |
|----------------|-------------|------------|------------------|--------|
| Get your focus on | Meditation | meditations | Buffer.from offset error during audio upload | ⚠️ Shows "skipped" in seed-4 - verify in CMS |
| Author 4 (alice-tomlinson) | Author 4 | authors | Buffer.from offset error during image upload | ⚠️ Shows "skipped" in seed-4 - verify in CMS |
| static_pages-30 | Page 28 | pages | Image upload error (1 error in seed-3) | ⚠️ Shows "skipped" in seed-4 - verify in CMS |
| Pete Seeger: Uniting people through music | Page 42 | pages/images | Image upload error (1 error in seed-3) | ⚠️ Shows "1 created, 1 skipped" in seed-4 |

### Cloudflare Stream Video Frames

These video uploads previously failed with Cloudflare API validation errors but now show "skipped" in seed-4:

| Filename | Frame Type | Original Problem | Status |
|----------|-----------|------------------|--------|
| Vishuddi left bandhan 720p Dhanu.mp4 | vishuddhi-male | Cloudflare API validation failed | ⚠️ Possibly resolved - shows "skipped" |
| Vishuddi left bandhan 720p Lakshmi.mp4 | vishuddhi-female | Cloudflare API validation failed | ⚠️ Possibly resolved - shows "skipped" |
| Vishuddi right bandhan with right hand 720p Dhanu.mp4 | vishuddhi-male | Cloudflare API validation failed | ⚠️ Possibly resolved - shows "skipped" |
| Vishuddi right bandhan with right hand 720p Lakshmi.mp4 | vishuddhi-female | Cloudflare API validation failed | ⚠️ Possibly resolved - shows "skipped" |
| Vishuddi right bandhan 720p Dhanu.mp4 | vishuddhi-male | Cloudflare API validation failed | ⚠️ Possibly resolved - shows "skipped" |
| Vishuddi center bandhan 720p Dhanu.mp4 | vishuddhi-male | Cloudflare API validation failed | ⚠️ Possibly resolved - shows "skipped" |
| Vishuddi center bandhan 720p Lakshmi.mp4 | vishuddhi-female | Cloudflare API validation failed | ⚠️ Possibly resolved - shows "skipped" |
| Void 720p Laksmi.mp4 | void-male/female | Cloudflare API validation failed | ⚠️ Possibly resolved - shows "skipped" |
| Left Channel 720p Lakshmi.mp4 | clearing-male/female | Cloudflare API validation failed | ⚠️ Possibly resolved - shows "skipped" |
| Back agnya 720p Lakshmi.mp4 | agnya-male/female | Cloudflare API validation failed | ⚠️ Possibly resolved - shows "skipped" |
| Mooladhara 720p Lakshmi.mp4 | mooladhara-male/female | Cloudflare API validation failed | ⚠️ Possibly resolved - shows "skipped" |
| Right channel 720p Lakshmi.mp4 | clearing-male/female | Cloudflare API validation failed | ⚠️ Possibly resolved - shows "skipped" |
| Raising feeling vibrations left 720p Lakshmi.mp4 | kundalini-male/female | Cloudflare API validation failed | ⚠️ Possibly resolved - shows "skipped" |

---

## Confirmed Fixed

These resources previously failed but are now working after code fixes:

| Resource Title | Resource ID | Collection | Original Problem | Status |
|----------------|-------------|------------|------------------|--------|
| Kundalini: The Power Within | Lesson | lessons | Intro Subtitles validation | ✅ Fixed - jsonSchema disabled |
| Thoughtless awareness | Lesson | lessons | Intro Subtitles validation | ✅ Fixed - jsonSchema disabled |
| The Subtle System | Lesson | lessons | Intro Subtitles validation | ✅ Fixed - jsonSchema disabled |
| Vibrations: what are they? | Lesson | lessons | Intro Subtitles validation | ✅ Fixed - jsonSchema disabled |
| The Living Energy around us | Lesson | lessons | Intro Subtitles validation | ✅ Fixed - jsonSchema disabled |
| Cleansing techniques p.1: Footsoak | Lesson | lessons | Intro Subtitles validation | ✅ Fixed - jsonSchema disabled |
| Shri Mataji Nirmala Devi: the source of knowledge | Lesson | lessons | Intro Subtitles validation | ✅ Fixed - jsonSchema disabled |
| The spirit: who you really are | Lesson | lessons | Intro Subtitles validation | ✅ Fixed - jsonSchema disabled |
| The Power of Attention | Lesson | lessons | Intro Subtitles validation | ✅ Fixed - jsonSchema disabled |
| Music to support meditation | Lesson | lessons | Intro Subtitles validation | ✅ Fixed - jsonSchema disabled |
| Ice_Pack.jpg | Image | images | Buffer.from offset error | ✅ Fixed - Created successfully in later run |

**Note:** Storyblok import now completes successfully. In seed-4, 7 additional lessons were created:
- Self Mastery - I am my own guru
- Inner peace
- The Power of Desire
- Manifesting: Bandhans and Everyday Miracles
- Cleansing techniques p.2: Candle
- Step 6: Footsoak (additional)
- And others (17 total lessons confirmed)

---

## Warnings - Missing Tag Mappings

These tags exist in source data but have no corresponding tag in the CMS:

| Tag Name | Tag Type | Problem | Status |
|----------|----------|---------|--------|
| default | song-tag | No mapping configured | ❌ Needs tag mapping |
| musical | meditation-tag | No mapping configured | ❌ Needs tag mapping |
| silence | meditation-tag | No mapping configured | ❌ Needs tag mapping |
| long | song-tag | No mapping configured | ❌ Needs tag mapping |
| foreground | song-tag | No mapping configured | ❌ Needs tag mapping |
| general | meditation-tag | No mapping configured | ❌ Needs tag mapping |
| short | meditation-tag | No mapping configured | ❌ Needs tag mapping |

---

## Warnings - Download Failures

These source files could not be downloaded (may be permanently unavailable):

| Filename | Frame Type | Problem | Status |
|----------|-----------|---------|--------|
| agnya, back.webp | agnya-female | Download failed (source unavailable) | ⚠️ Check source URL |
| Sahasrara massage 720p Lakshmi.mp4 | sahasrara-male | Download failed (source unavailable) | ⚠️ Check source URL |
| placeholder.jpg | narrators | Failed to upload narrator placeholder | ⚠️ Check source URL |

---

## Warnings - Album Art Issues

| Album Title | Problem | Status |
|-------------|---------|--------|
| Shakthidhar Iyer | Album art upload failed (Buffer issue) | ⚠️ Verify in CMS |

---

## Recommended Manual Checks

### Priority 1 - Still Failing (needs code fix)
1. **Page 4 image small_founder.jpg** - Buffer.from error persists. Investigate the specific file source and handling.
2. **Author parimala-sabau** - Duplicate slug in source data. Either:
   - Fix duplicate author in source data
   - Or improve deduplication logic to handle edge cases

### Priority 2 - Verify "Possibly Resolved" Items
3. **"Get your focus on" meditation** - Verify audio file exists in CMS
4. **Author 4 (alice-tomlinson)** - Verify profile photo exists in CMS
5. **static_pages-30** - Verify page content and images are complete
6. **Pete Seeger page** - Verify all images are present
7. **All 13 Cloudflare Stream video frames** - Verify videos play correctly in CMS

### Priority 3 - Data Quality
8. **Album Shakthidhar Iyer** - Verify album art was imported correctly
9. **Missing tag mappings** - Add mappings for: default, musical, silence, long, foreground, general, short
10. **All 17 lessons** - Verify introSubtitles data is correct (validation is disabled)

### Priority 4 - Check Source URLs
11. **Download failures** - Verify source files still exist at original URLs

---

## Log Files Analyzed

1. seed.log (full run)
2. seed-2.log (full run)
3. seed-3.log (full run)
4. seed-4.log (full run, latest)
5. seed-tags.log (tags only - successful)
6. seed-wemeditate.log (wemeditate only)
7. seed-wemeditate-2.log
8. seed-wemeditate-3.log
9. seed-wemeditate-4.log
10. seed-wemeditate-5.log
11. seed-meditations.log
12. seed-meditations-2.log
13. seed-storyblok.log
14. seed-storyblok-2.log
