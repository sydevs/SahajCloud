# Seed tests

Integration specs for seed importers that run against a live database. They are
collected by the integration lane through its `seeds/**/*.test.ts` include
(`vitest.config.mts`), so they are named `*.test.ts`, not `*.int.spec.ts`, and
use `createTestEnvironment()` like any int spec (`tests/AGENTS.md`).

Run one the same way as an int spec:

```bash
pnpm exec vitest run seeds/tests/atlas-translations-import.test.ts --config ./vitest.config.mts
```
