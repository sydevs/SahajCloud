# Import Tests

Testing infrastructure for the import scripts, run against a Postgres test
schema.

## Database architecture

**Two separate databases:**

1. **Payload storage (Postgres)** — a dedicated `seed_test` schema in the same
   Postgres the app uses (`DATABASE_URL`), auto-synced via Drizzle `push` —
   see `seeds/tests/test-payload.config.ts`. Production runs on Railway
   Postgres.
2. **Source data (Postgres)** — a temporary database for the meditations and
   wemeditate imports, created from `data.bin` files. Requires PostgreSQL
   installed.

## Test scripts

### Setup/cleanup

```bash
# Initialize the test database
pnpm tsx seeds/tests/setup-test-db.ts setup

# View collection counts
pnpm tsx seeds/tests/check-db-stats.ts

# View tag information
pnpm tsx seeds/tests/check-tags.ts
```

### Test runners

```bash
# Storyblok (requires an API token)
./seeds/tests/test-storyblok.sh

# Meditations (requires data.bin)
./seeds/tests/test-meditations.sh
```

### Manual testing

```bash
export PAYLOAD_SECRET="test-secret-key-12345"

# Dry run
pnpm tsx seeds/meditations/import.ts --dry-run

# Full import
pnpm tsx seeds/meditations/import.ts

# Check results
pnpm tsx seeds/tests/check-db-stats.ts
```

## Test results

| Script      | Status              | Notes                 |
| ----------- | ------------------- | --------------------- |
| Meditations | PASSING             | 255 documents created |
| Tags        | PASSING             | 28 tags created       |
| Storyblok   | Requires API token  | Structure verified    |
| WeMeditate  | Requires PostgreSQL | Structure verified    |

## Success criteria

- Completes without fatal errors
- Creates the expected document counts
- Creates import tags correctly
- Tags media files with the import tag
- Handles duplicates gracefully

## Troubleshooting

**"PostgreSQL command not found"**

```bash
brew install postgresql  # macOS
```

PostgreSQL is only needed for the meditations and wemeditate imports.

**"STORYBLOK_ACCESS_TOKEN not set"** — expected for Storyblok tests without
API access.

**"data.bin not found"** — place a PostgreSQL dump at
`seeds/meditations/data.bin`.

**"DATABASE_URL not set / connection refused"** — set `DATABASE_URL` to a
reachable Postgres. The test config (`test-payload.config.ts`) uses the
`seed_test` schema and auto-syncs via Drizzle `push`. Locally, point it at
your dev Postgres.
