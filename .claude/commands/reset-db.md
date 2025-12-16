# Reset Database and Migrations

Reset all PayloadCMS migrations and D1 databases (local and production) to start fresh with the current schema.

**WARNING: This is a destructive operation. All data in local and production databases will be lost.**

## Instructions

Execute the following steps in order. Ask for user confirmation before resetting the production database.

### Step 1: Delete Migration Files

Remove all migration files except `index.ts`:

```bash
# Find and delete all .ts migration files (not index.ts)
find src/migrations -name "*.ts" ! -name "index.ts" -delete

# Delete all .json metadata files
find src/migrations -name "*.json" -delete
```

### Step 2: Reset migrations/index.ts

Update the migrations index to an empty array:

```typescript
export const migrations = [];
```

### Step 3: Reset Local D1 Database

Delete the local D1 database directory:

```bash
rm -rf .wrangler/state/v3/d1
```

### Step 4: Generate Fresh Migration

Create a new initial migration from the current schema:

```bash
pnpm payload migrate:create initial_schema
```

This will regenerate `src/migrations/index.ts` with the new migration.

### Step 5: Reset Production D1 Database

**ASK USER FOR CONFIRMATION BEFORE PROCEEDING.**

Delete and recreate the production database:

```bash
# Delete existing database
pnpm exec wrangler d1 delete sahajcloud

# Create new database in EU jurisdiction
pnpm exec wrangler d1 create sahajcloud --jurisdiction=eu
```

### Step 6: Update wrangler.toml

Extract the new `database_id` from the wrangler output and update `wrangler.toml`:

```toml
[[d1_databases]]
binding = "D1"
database_name = "sahajcloud"
database_id = "<NEW_DATABASE_ID>"
remote = true
```

## Key Details

- **Database name**: `sahajcloud`
- **Jurisdiction**: `eu` (EEUR region - required for data residency)
- **Wrangler command**: Use `pnpm exec wrangler` (not bare `wrangler`)
- **Local database location**: `.wrangler/state/v3/d1`
- **Migrations directory**: `src/migrations/`

## Post-Reset

After reset, the local development server will automatically run migrations when started with `PORT=<port> pnpm dev`.

For production, deploy the app to run migrations:
```bash
pnpm run deploy:prod
```
