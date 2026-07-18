# Reset Database and Migrations

Reset local PayloadCMS migrations and PostgreSQL database to start fresh with the current schema.

**WARNING: This is a destructive operation. All data in the local database will be lost.**

## Local Workflow

Local development uses PostgreSQL with Drizzle `push: true` (auto-schema-sync). To reset:

### Step 1: Delete the local database

Drop and recreate your local PostgreSQL database:

```bash
# Replace 'sahajcloud' with your actual local DB name if different
dropdb sahajcloud
createdb sahajcloud
```

### Step 2: Restart the dev server

The dev server will auto-sync the schema on next boot:

```bash
pnpm devsafe  # clears .next and restarts, or
.claude/skills/dev-server/dev-server.sh restart
```

This will run Drizzle `push` and populate the schema from `src/payload.config.ts`.

### Step 3: Re-seed data (optional)

If needed, re-populate test/seed data:

```bash
pnpm seed <script-name>  # e.g., pnpm seed meditations
```

See `seeds/AGENTS.md` for available scripts.

## Migration Workflow (if editing schema)

If you modified `src/collections/`, `src/fields/`, `src/globals/`, or `src/payload.config.ts`:

1. **Create migration** (attempt non-interactively first; hand to the user only on timeout — see `.claude/rules/migrations.md` for the outcome table):

   ```bash
   timeout 30 pnpm db:migrations:create <name> -- --skip-empty < /dev/null
   ```

2. **Commit migration files** in a separate commit:

   ```bash
   git add src/migrations/
   git commit -m "chore(migrations): <description>"
   ```

3. **Apply on next dev boot** — migrations auto-apply during server startup via Payload's `prodMigrations`.

See `.claude/rules/migrations.md` for the full migration workflow.

## Key Details

- **Local database**: PostgreSQL (dev uses Drizzle `push: true`)
- **Migrations directory**: `src/migrations/`
- **Production migrations**: Applied in-process on server boot (no preDeployCommand)
- **Dev server**: `pnpm dev` or `.claude/skills/dev-server/dev-server.sh` (shared across sessions)
