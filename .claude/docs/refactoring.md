# Refactoring Patterns

This document covers systematic approaches for common refactoring tasks in this codebase.

## Collection Rename Pattern

When renaming a PayloadCMS collection (e.g., `Music` → `Songs`), follow this systematic approach:

### Files to Update (in order)

#### 1. Collection File

Rename file and update:
- Export name
- `slug` field
- `staticDir` path (if upload collection)
- Any `virtualUrlField` collection references

#### 2. Collection Exports

Update barrel exports:
- `src/collections/content/index.ts` (or appropriate subdir)
- `src/collections/index.ts`

#### 3. Related Collections

Update references:
- Join fields (`collection` property)
- Relationship fields (`relationTo` property)
- Field names (e.g., `musicTag` → `songTag`)

#### 4. Configuration Files

- `src/lib/storage/storagePlugin.ts` - Collection routing
- `src/lib/access/config/projects.ts` - Project collection lists
- `src/lib/access/config/roles.ts` - Role permissions

#### 5. Global Settings

Update/remove relationship fields in globals that reference the collection

#### 6. Admin Components

Update collection references:
- Dashboard metrics
- Custom cells
- API route handlers

#### 7. Test Files

- Rename test file (e.g., `music.int.spec.ts` → `songs.int.spec.ts`)
- Update `tests/utils/testData.ts` factory functions
- Update `tests/utils/testHelpers.ts` collection lists
- Update all test assertions

#### 8. Seed Scripts

Update all seed importers in `seeds/`

#### 9. Database Migration

Create migration for:
- Table renames
- Column renames
- Index renames

#### 10. Type Generation

Run `pnpm generate:types` to regenerate TypeScript types

#### 11. Documentation

Update:
- `AGENTS.md` project structure
- `.claude/docs/architecture.md`
- `.claude/docs/components/project-visibility.md`
- Any other docs referencing the collection

## Upload-to-Relationship Conversion Pattern

When converting a collection from an upload collection to a standard collection with a `mediaField()` relationship (e.g., Albums artwork, AppCards image), follow this checklist:

### Files to Update (in order)

#### 1. Collection File

- Remove `upload` config block (`staticDir`, `mimeTypes`, `focalPoint`, etc.)
- Remove `virtualUrlField` import and usage
- Add `mediaField()` from `@/fields` with appropriate name and options

#### 2. Storage Plugin

- Remove the collection's entry from `src/lib/storage/storagePlugin.ts`

#### 3. Seed Scripts

- Search `seeds/` for any code that creates documents in this collection with a `file:` property
- Update to: upload the image to `images` collection first, then create the document with the relationship ID
- This is easy to miss — `pnpm generate:types` + `wrangler types` will catch it as a build error

#### 4. Test Helpers

- Update `tests/utils/testData.ts` factory functions to use `createMediaImage()` + relationship ID instead of `file:` uploads
- Remove the collection from `UPLOAD_COLLECTIONS` in `tests/utils/testHelpers.ts` (if listed)

#### 5. Test Files

- Remove upload-specific tests (MIME type validation, format support, file rejection)
- Update assertions that reference upload fields (`filename`, `mimeType`, `filesize`)
- Add relationship population test (`depth: 1` returns nested image object)

#### 6. Database Migration

- Run `pnpm payload migrate:create` after collection changes
- Migration should add `<field>_id` column and drop upload columns (`filename`, `mime_type`, `filesize`, `width`, `height`, `focal_x`, `focal_y`, `thumbnail_u_r_l`)
- Version tables (`_<collection>_v`) also need the same changes

#### 7. Documentation

- Update `.claude/docs/architecture.md` storage adapter mapping and collection descriptions

### Verification

After completing all updates:

1. `pnpm generate:types` - Regenerate types
2. `pnpm lint` - Fix import issues
3. `pnpm build` - Verify compilation
4. `pnpm test` - Run full test suite
5. Manual testing of API endpoints and admin UI
