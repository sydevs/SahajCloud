# Migrations — Postgres baseline (reset for #466)

The 36 SQLite/D1 migrations were **removed** during the Railway + Postgres
migration (#466). They imported `@payloadcms/db-d1-sqlite` and encoded the
SQLite dialect, so they do not apply to Postgres. Only the **data** migrates
1:1 (see the ETL step in the PR / runbook); the schema starts from a fresh
Postgres baseline.

## Postgres baseline

`20260606_050852_initial_schema.{ts,json}` is the Postgres baseline — generated
with `pnpm db:migrations:create` and tested locally with `pnpm db:migrate` against
a local Postgres database. Production applies migrations automatically in-process
on server boot via `prodMigrations` (see `src/payload.config.ts`); dev uses `push: true`
and doesn't need the migration files.

Regenerate after schema changes:

```bash
pnpm db:migrations:create <name>   # writes the next src/migrations/<ts>_<name>.{ts,json}
pnpm db:migrate                    # applies pending migrations to DATABASE_URL
```

See `src/migrations/AGENTS.md` for the full workflow.
