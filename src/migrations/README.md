# Migrations — Postgres baseline (reset for #466)

The 36 SQLite/D1 migrations were **removed** during the Railway + Postgres
migration (#466). They imported `@payloadcms/db-d1-sqlite` and encoded the
SQLite dialect, so they do not apply to Postgres. Only the **data** migrates
1:1 (see the ETL step in the PR / runbook); the schema starts from a fresh
Postgres baseline.

## Postgres baseline

`20260606_050852_initial_schema.{ts,json}` is the Postgres baseline — generated
with `pnpm db:migrations:create` and applied (`pnpm db:migrate`) against the
Railway Postgres 18 instance (117 tables). Production/CI apply it via
`pnpm db:migrate`; dev uses `push: true` (see `src/payload.config.ts`) and
doesn't need it.

Regenerate after schema changes:

```bash
pnpm db:migrations:create <name>   # writes the next src/migrations/<ts>_<name>.{ts,json}
pnpm db:migrate                    # applies pending migrations to DATABASE_URL
```

Optionally regenerate the Drizzle schema snapshot for editor type-safety:

```bash
pnpm payload generate:db-schema  # -> src/payload-generated-schema.ts (gitignored from typecheck)
```

Optionally regenerate the Drizzle schema snapshot for editor type-safety:

```bash
pnpm payload generate:db-schema  # -> src/payload-generated-schema.ts (gitignored from typecheck)
```

See `.claude/rules/migrations.md` for the full workflow.
