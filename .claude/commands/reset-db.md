# Reset Database and Migrations

Reset the local PayloadCMS database to match the current schema.

**Warning: this is destructive. It deletes all local data.**

## Local reset

Local development uses PostgreSQL with Drizzle `push: true` (auto-schema-sync).

### Step 1: Delete the local database

```bash
# Replace 'sahajcloud' with your local database name if it differs
dropdb sahajcloud
createdb sahajcloud
```

### Step 2: Restart the dev server

```bash
pnpm devsafe   # clears .next, then restarts
```

Or run `/workflow:dev-server restart` for the shared dev-server skill. Either way, Drizzle runs
`push` on boot and rebuilds the schema from `src/payload.config.ts`.

### Step 3: Re-seed data (optional)

```bash
pnpm seed <script-name>   # e.g. pnpm seed meditations
```

See `seeds/AGENTS.md` for the list of available scripts.

## Schema changes

If you changed `src/collections/`, `src/fields/`, `src/globals/`, or `src/payload.config.ts`,
create a migration instead of only resetting local data:

```bash
timeout 30 pnpm db:migrations:create <name> --skip-empty < /dev/null
git add src/migrations/
git commit -m "chore(migrations): <description>"
```

The migration auto-applies on the next server boot, local or Railway. See
`src/migrations/AGENTS.md` for the full workflow, the outcome table, and the timeout rationale.

## Key facts

- **Local database**: PostgreSQL, with Drizzle `push: true`.
- **Migrations directory**: `src/migrations/`.
- **Production migrations**: apply in-process on server boot. There is no separate deploy step.
