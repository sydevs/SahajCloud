# ⚠️ DEPRECATED: FFmpeg/fluent-ffmpeg

**Status**: Deprecated - Scheduled for removal
**Current Decision**: Continue using `fluent-ffmpeg` temporarily despite deprecation
**Reviewed**: 2025-10-28

## Overview

- **Purpose**: Video metadata extraction and thumbnail generation
- **Package**: `fluent-ffmpeg` (deprecated but functional)
- **Usage**: `src/lib/fileUtils.ts` - ffprobe metadata, video thumbnails

## Why Still Using

- ✅ Stable, feature-complete, works reliably
- ✅ Underlying `ffmpeg-static` binary still maintained
- ✅ Migration effort outweighs current benefits
- ⚠️ Package marked deprecated, no security issues

## Migration Plan

When ready to migrate, use `@ffprobe-installer` + `@ffmpeg-installer` with child_process for direct binary access. Requires comprehensive testing across platforms and video formats.

**Monitoring**: Monthly `pnpm audit` checks, migrate immediately if security vulnerabilities found.
