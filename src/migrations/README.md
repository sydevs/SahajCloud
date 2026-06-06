# Migrations — Postgres baseline (reset for #466)

The 36 SQLite/D1 migrations were **removed** during the Railway + Postgres
migration (#466). They imported `@payloadcms/db-d1-sqlite` and encoded the
SQLite dialect, so they do not apply to Postgres. Only the **data** migrates
1:1 (see the ETL step in the PR / runbook); the schema starts from a fresh
Postgres baseline.

## TODO(railway): generate the Postgres baseline

Once a Railway Postgres instance exists and `DATABASE_URL` points at it:

```bash
# Interactive — run locally against the new Postgres DB
pnpm db:migrations:create        # -> creates src/migrations/<timestamp>_initial_schema.{ts,json}
pnpm db:migrate                  # applies it (payload migrate)
```

Dev uses `push: true` (see `src/payload.config.ts`), so local schema is synced
without migrations; production/CI run `pnpm db:migrate` against `DATABASE_URL`.

Optionally regenerate the Drizzle schema snapshot for editor type-safety:

```bash
pnpm payload generate:db-schema  # -> src/payload-generated-schema.ts (gitignored from typecheck)
```

See `.claude/rules/migrations.md` for the full workflow.
