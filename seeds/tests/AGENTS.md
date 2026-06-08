# Import Tests

Testing infrastructure for import scripts, run against a Postgres test schema.

## Database Architecture

**Two separate databases**:

1. **Payload storage (Postgres)**
   - A dedicated `seed_test` schema in the same Postgres the app uses
     (`DATABASE_URL`), auto-synced via Drizzle `push` — see
     `seeds/tests/test-payload.config.ts`.
   - Production runs on Railway Postgres.

2. **Source data (Postgres)**
   - Temporary database for meditations/wemeditate imports
   - Created from `data.bin` files
   - Requires PostgreSQL installed

## Test Scripts

### Setup/Cleanup

```bash
# Initialize test database
pnpm tsx seeds/tests/setup-test-db.ts setup

# View collection counts
pnpm tsx seeds/tests/check-db-stats.ts

# View tag information
pnpm tsx seeds/tests/check-tags.ts
```

### Test Runners

```bash
# Storyblok (requires API token)
./seeds/tests/test-storyblok.sh

# Meditations (requires data.bin)
./seeds/tests/test-meditations.sh
```

### Manual Testing

```bash
export PAYLOAD_SECRET="test-secret-key-12345"

# Dry run
pnpm tsx seeds/meditations/import.ts --dry-run

# Full import
pnpm tsx seeds/meditations/import.ts

# Check results
pnpm tsx seeds/tests/check-db-stats.ts
```

## Test Results

| Script      | Status              | Notes                 |
| ----------- | ------------------- | --------------------- |
| Meditations | PASSING             | 255 documents created |
| Tags        | PASSING             | 28 tags created       |
| Storyblok   | Requires API token  | Structure verified    |
| WeMeditate  | Requires PostgreSQL | Structure verified    |

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

Place PostgreSQL dump at `seeds/meditations/data.bin`

### "DATABASE_URL not set / connection refused"

Set `DATABASE_URL` to a reachable Postgres — the test config (`test-payload.config.ts`)
uses the `seed_test` schema and auto-syncs via Drizzle `push`. Locally, point it
at your dev Postgres.
