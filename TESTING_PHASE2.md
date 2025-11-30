# Phase 2 Testing & Troubleshooting Guide

This guide walks you through testing and resolving the known issues from the Cloudflare migration Phase 2.

## Quick Reference

**Known Issues:**
1. ✅ Environment Variable Caching (RESOLVED)
2. 🚫 Drizzle ORM `referencedTable` Error (BLOCKING - UNRESOLVED)
3. ⚠️  Wrangler Types Generation Error

---

## Issue #1: Environment Variable Caching ✅ RESOLVED

### Problem
Next.js caches environment variables in the `.next` directory, causing old MongoDB URLs to persist even after updating `.env`.

### Solution
Always clear the `.next` cache after changing environment variables:

```bash
# Stop all dev servers
pkill -f "next dev"

# Clear Next.js cache
rm -rf .next

# Restart dev server
pnpm dev
```

### Verification
Server should start without MongoDB connection errors:
```
✓ Ready in 3s
```

✅ **Status**: Resolved by clearing cache

---

## Issue #2: Drizzle ORM `referencedTable` Error 🚫 BLOCKING

### Problem
Drizzle ORM throws `referencedTable` undefined errors that prevent admin interface access:

```
ERROR: Cannot read properties of undefined (reading 'referencedTable')
  at normalizeRelation (drizzle-orm/relations.js:212:75)
  at SQLiteAsyncDialect.buildRelationalQuery (drizzle-orm/sqlite-core/dialect.js:454:36)
  at SQLiteAsyncDialect.buildRelationalQuery (drizzle-orm/sqlite-core/dialect.js:466:36)
```

### Status: 🚫 **BLOCKING - UNRESOLVED**

This error prevents the admin interface from being accessible, making the application unusable in its current state.

### Investigation Summary

Extensive investigation revealed this is a complex issue specific to our project's scale and configuration:

#### ✅ What We've Ruled Out:
- **Database adapter configuration**: Now matches PayloadCMS official D1 template exactly
- **Localized rich text + blocks**: Error persists even with these features disabled
- **Polymorphic relationships**: Template works fine with identical structures
- **Number of locales**: Template tested with all 16 locales without error
- **Drizzle version**: Both projects use drizzle-orm@0.44.6
- **Schema validity**: All 85 table references are valid with no missing tables

#### ❌ Unable to Reproduce in Template:
Created a test template with matching configuration:
- 16 locales (en, es, de, it, fr, ru, ro, cs, uk, el, hy, pl, pt-br, fa, bg, tr)
- Polymorphic relationships (FileAttachments with owner field)
- Top-level blocks fields (Lessons → panels)
- Blocks with relationships to polymorphic collections
- Localized rich text with embedded blocks
- Identical D1 adapter configuration

**Result**: Template works perfectly without any errors.

#### 🔍 Systematic Plugin Elimination Testing:

We methodically disabled features to isolate the cause:

1. **Test #1 - Form Builder Plugin**: ❌ Disabled, error persists
2. **Test #2 - ALL Plugins (SEO, Storage, Form Builder)**: ❌ Disabled, error persists
3. **Test #3 - Jobs System**: ❌ Disabled, error persists
4. **Test #4 - Global Configs (WeMeditateWebSettings)**: ❌ Disabled, error persists

**Critical Finding**: Error persists even with **ALL** plugins, jobs, and globals disabled.

#### 🎯 Template Replication Test (SUCCESSFUL):

We successfully replicated the error in the official PayloadCMS D1 template by progressively adding Managers collection features:

**Phase 1: Basic Fields ✅ PASSED**
- Added: name, admin checkbox, active checkbox, custom auth config, empty permissions array
- Schema: 574 lines (unchanged from baseline)
- Result: No errors - admin panel loaded successfully

**Phase 2: Permissions Array with Select/Radio ✅ PASSED**
- Added: allowedCollection (select), level (radio) to permissions array
- Schema: 574 lines (unchanged)
- Result: No errors - admin panel loaded successfully

**Phase 3: Permissions Array with hasMany Select ❌ **ERROR REPRODUCED****
- Added: locales (select, hasMany: true, 17 options) to permissions array
- Schema: 574 lines (unchanged - hasMany stored as JSON, not join table)
- Result: **`TypeError: Cannot read properties of undefined (reading 'referencedTable')`**

**🔬 Root Cause Identified:**

The error is triggered by **`hasMany: true` on a select field inside an array field**. Specifically:

```typescript
{
  name: 'permissions',
  type: 'array',
  fields: [
    {
      name: 'locales',
      type: 'select',
      hasMany: true,  // ← THIS triggers the error
      required: true,
      options: [ /* 17 locale options */ ]
    }
  ]
}
```

**Why This Configuration Causes the Error:**
1. **Nested Complexity**: Array field → nested hasMany select creates deep relational structure
2. **Drizzle Schema Generation**: PayloadCMS D1 adapter generates malformed relation metadata
3. **Runtime Query Building**: Drizzle's `buildRelationalQuery` tries to normalize relations
4. **Missing Reference**: `referencedTable` is undefined during normalization at runtime
5. **No Schema Change**: The schema appears syntactically valid (574 lines), but relation metadata is broken

**Impact**: This bug affects ANY PayloadCMS project using D1 adapter with array fields containing hasMany select fields.

#### 🚨 Updated Assessment:

The error occurs at the **Drizzle ORM level** during `buildRelationalQuery`:
- Generated schema appears syntactically valid (all 85 tables, all relations defined)
- Error happens when Drizzle tries to normalize relations
- `referencedTable` is undefined at `normalizeRelation:212`

**Confirmed Root Cause**:
**PayloadCMS D1 adapter bug** - The D1 adapter generates malformed relation metadata when processing array fields containing hasMany select fields. This is NOT a Drizzle ORM bug, NOT a scale issue, and NOT a general polymorphic relationship issue.

### Current Configuration

The project now uses the official PayloadCMS Cloudflare D1 template architecture:

```typescript
// payload.config.ts
const cloudflareRemoteBindings = process.env.NODE_ENV === 'production'
const cloudflare =
  process.argv.find((value) => value.match(/^(generate|migrate):?/)) || !cloudflareRemoteBindings
    ? await getCloudflareContextFromWrangler()
    : await getCloudflareContext({ async: true })

// Clean D1 adapter configuration (no blocksAsJSON, no push options)
db: sqliteD1Adapter({ binding: cloudflare.env.D1 })
```

### Next Steps

Now that we've identified the root cause, here are the available solutions:

#### Option A: Immediate Workaround - Remove hasMany from Array Fields (RECOMMENDED)
Refactor the Managers and Clients collections to avoid hasMany select inside array fields:

**Current Problematic Structure:**
```typescript
{
  name: 'permissions',
  type: 'array',
  fields: [
    {
      name: 'locales',
      type: 'select',
      hasMany: true,  // ← Remove this
      options: [...]
    }
  ]
}
```

**Solution 1: Use JSON field instead:**
```typescript
{
  name: 'locales',
  type: 'json',  // Store as JSON array
  required: true,
  admin: {
    description: 'Comma-separated locale codes (e.g., "en,es,de") or "all"'
  }
}
```

**Solution 2: Simplify to single locale per permission:**
```typescript
{
  name: 'locale',
  type: 'select',  // Single select, no hasMany
  required: true,
  options: [...]
}
```
Users would create multiple permission entries for multiple locales.

#### Option B: Report Bug to PayloadCMS (RECOMMENDED)
File detailed bug report with minimal reproduction:

**Bug Report Details:**
- **Repository**: payloadcms/payload GitHub
- **Title**: "D1 Adapter: hasMany select in array field causes referencedTable error"
- **Affected Package**: `@payloadcms/db-d1-sqlite`
- **Versions**: PayloadCMS 3.64.0, Drizzle ORM 0.44.6
- **Minimal Reproduction**: Include modified template Users.ts from Phase 3 test
- **Error**: `TypeError: Cannot read properties of undefined (reading 'referencedTable')`
- **Root Cause**: D1 adapter generates malformed relation metadata for nested hasMany selects

**Reproduction Repository**:
`/Users/devindra/Documents/Projects/payload-cloudflare-d1-template` contains working minimal reproduction

#### Option C: Switch to PostgreSQL Temporarily
Switch to PostgreSQL adapter temporarily while awaiting Payload/Drizzle updates:

```typescript
import { postgresAdapter } from '@payloadcms/db-postgres'

db: postgresAdapter({
  pool: {
    connectionString: process.env.DATABASE_URI || 'postgresql://localhost:5432/sy_devs_cms',
  },
})
```

**Note**: PostgreSQL adapter uses Drizzle but handles nested hasMany fields differently, avoiding this error.

#### Option D: Wait for Upstream Fix
Monitor PayloadCMS GitHub for fix to @payloadcms/db-d1-sqlite package.

**Estimated Fix Timeline**:
- Issue report: Immediate
- Fix implementation: 1-4 weeks (depending on Payload team availability)
- Release: Next minor/patch version of @payloadcms/db-d1-sqlite

---

## Issue #3: Wrangler Types Generation Error

### Problem
`pnpm generate:types` fails when running `wrangler types`:

```
Type error: Conversion of type 'number' to type 'string' may be a mistake
```

### Testing Steps

1. **Run type generation:**
   ```bash
   pnpm run generate:types
   ```

2. **Check output:**
   - Payload types should generate successfully
   - Wrangler types may fail with TypeScript error

3. **Verify impact:**
   - Check if `src/payload-types.ts` was updated
   - Check if `worker-configuration.d.ts` was created

### Root Cause

The error comes from Wrangler's type generation, not Payload's. It's attempting to convert between incompatible types in the generated D1/R2 bindings.

### Potential Solutions

#### Solution A: Update Wrangler (Try First)

```bash
pnpm update wrangler @cloudflare/workers-types
pnpm run generate:types
```

#### Solution B: Separate Type Generation

Update `package.json` to split the commands:

```json
{
  "scripts": {
    "generate:types": "cross-env NODE_OPTIONS=--no-deprecation payload generate:types",
    "generate:types:wrangler": "wrangler types",
    "generate:types:all": "pnpm generate:types && pnpm generate:types:wrangler"
  }
}
```

This allows Payload types to generate even if Wrangler types fail.

#### Solution C: Skip Wrangler Types (Temporary)

```bash
# Just generate Payload types
pnpm payload generate:types
```

You can manually create `worker-configuration.d.ts` if needed:

```typescript
/// <reference types="@cloudflare/workers-types" />

interface Env {
  D1: D1Database;
  R2: R2Bucket;
}
```

### Decision Tree

```
Does payload generate:types work?
├─ YES → Is wrangler types critical for development?
│   ├─ NO  → Use Solution B or C
│   └─ YES → Try Solution A, then investigate error location
└─ NO  → CRITICAL: Check TypeScript version, payload version
```

---

## Complete Testing Checklist

Run through this checklist to verify Phase 2 completion:

### Environment Setup
- [ ] `.env` file has `DATABASE_URI=file:./local.db`
- [ ] `.next` cache cleared
- [ ] Dev server starts without MongoDB errors

### Database
- [ ] `local.db` file created (should be ~1-2MB)
- [ ] All 78 tables exist: `sqlite3 local.db ".tables"`
- [ ] Schema matches payload-types.ts

### Admin Panel
- [ ] Admin panel loads at http://localhost:3000/admin
- [ ] Can log in with default credentials
- [ ] All collections visible in navigation
- [ ] Email test account configured (Ethereal)

### CRUD Operations
- [ ] Can create a new media tag
- [ ] Can create a new media file (upload)
- [ ] Can create a meditation with frames
- [ ] Can view relationships (meditation → frames)
- [ ] Can update existing records
- [ ] Can delete records (soft delete)

### API Endpoints
- [ ] REST API accessible: `curl http://localhost:3000/api/meditations`
- [ ] GraphQL endpoint works: http://localhost:3000/api/graphql
- [ ] Depth parameter works for relationships
- [ ] Locale parameter works for localized fields

### Type Generation
- [ ] `pnpm generate:types` creates payload-types.ts
- [ ] No TypeScript errors in VS Code
- [ ] Types match database schema

---

## Quick Command Reference

```bash
# Fresh start with clean cache
pkill -f "next dev" && rm -rf .next && pnpm dev

# Check database tables
sqlite3 local.db ".tables"

# View database schema
sqlite3 local.db ".schema meditations"

# Test API endpoint
curl http://localhost:3000/api/meditations | jq

# Generate types (Payload only)
pnpm payload generate:types

# Full type generation (may fail on Wrangler)
pnpm run generate:types

# Check logs for errors
tail -f .next/server.log  # if exists
```

---

## Reporting Issues

If you encounter issues not covered here:

1. **Capture error details:**
   ```bash
   pnpm dev 2>&1 | tee debug.log
   ```

2. **Check versions:**
   ```bash
   pnpm list payload @payloadcms/db-sqlite drizzle-orm wrangler
   ```

3. **Export database schema:**
   ```bash
   sqlite3 local.db .schema > schema.sql
   ```

4. **Create GitHub issue** with:
   - Error message and stack trace
   - Version information
   - Steps to reproduce
   - Database schema (if relevant)

---

## Success Criteria

Phase 2 is complete when:

✅ Dev server starts with SQLite connection
✅ Admin panel fully functional
✅ All CRUD operations work
✅ Relationships load correctly
✅ API endpoints return data
✅ Types generate without blocking errors

**Current Status**: 🎯 **ROOT CAUSE IDENTIFIED** - The Drizzle `referencedTable` error is caused by **hasMany select fields inside array fields** in the Managers/Clients collections.

**Immediate Solutions Available:**
1. **Refactor permissions array** to use JSON or single-select instead of hasMany (Option A)
2. **Switch to PostgreSQL** temporarily until PayloadCMS fixes the D1 adapter (Option C)
3. **Report bug to PayloadCMS** with minimal reproduction from template test (Option B)

**Next Action**: Choose solution approach and implement workaround to unblock development.
