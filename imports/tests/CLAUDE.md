# Import Tests

Testing infrastructure for import scripts using in-memory SQLite.

## Database Architecture

**Two separate databases**:

1. **SQLite (Payload Storage)**
   - In-memory for tests (fast, isolated)
   - Production uses Wrangler D1
   - Automatically initialized by Payload

2. **PostgreSQL (Source Data)**
   - Temporary database for meditations/wemeditate imports
   - Created from `data.bin` files
   - Requires PostgreSQL installed

## Test Scripts

### Setup/Cleanup

```bash
# Initialize test database
pnpm tsx imports/tests/setup-test-db.ts setup

# View collection counts
pnpm tsx imports/tests/check-db-stats.ts

# View tag information
pnpm tsx imports/tests/check-tags.ts
```

### Test Runners

```bash
# Storyblok (requires API token)
./imports/tests/test-storyblok.sh

# Meditations (requires data.bin)
./imports/tests/test-meditations.sh
```

### Manual Testing

```bash
export PAYLOAD_SECRET="test-secret-key-12345"

# Dry run
pnpm tsx imports/meditations/import.ts --dry-run

# Full import
pnpm tsx imports/meditations/import.ts

# Check results
pnpm tsx imports/tests/check-db-stats.ts
```

## Test Results

| Script | Status | Notes |
|--------|--------|-------|
| Meditations | PASSING | 255 documents created |
| Tags | PASSING | 28 tags created |
| Storyblok | Requires API token | Structure verified |
| WeMeditate | Requires PostgreSQL | Structure verified |

## Success Criteria

- Complete without fatal errors
- Create expected document counts
- Create import tags correctly
- Tag media files with import tag
- Handle duplicates gracefully

## Troubleshooting

### "PostgreSQL command not found"
```bash
brew install postgresql  # macOS
```
Note: PostgreSQL only needed for meditations/wemeditate imports

### "STORYBLOK_ACCESS_TOKEN not set"
Expected for Storyblok tests without API access.

### "data.bin not found"
Place PostgreSQL dump at `imports/meditations/data.bin`

### "Better SQLite build errors"
```bash
pnpm rebuild better-sqlite3
```
