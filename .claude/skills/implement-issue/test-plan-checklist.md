# Test plan checklist

What to test, by change type. Reference `.claude/rules/tests.md` for the actual patterns.

## Collection changes (`src/collections/`)

- Field added/changed: integration test that creates a doc with the new field and reads it back
- Hook (beforeChange/afterChange/etc.) added: integration test exercising both the trigger path AND a path that should NOT trigger it
- Access function: integration test as **at least two roles** — one allowed, one denied
- Locale change: integration test across multiple locales
- Required field added to existing collection: integration test that existing docs without the field can still be read (backfill path)

## Endpoint changes (`src/endpoints/`, `src/app/(payload)/api/**/route.ts`)

- New endpoint: integration test for success + at least one failure case
- Auth-gated endpoint: integration test with valid auth + invalid/missing auth
- Query parameter validation: test the malformed-input path produces the expected 400
- Caching behavior (`Cache-Control` headers): verify the header is set correctly in the response

## Admin UI changes (`src/components/admin/`)

- New field component: render in a Vitest test if pure; E2E (Playwright) if it has interactions
- Custom cell: E2E test verifying it renders in the list view
- Conditional `admin.condition`: E2E test toggling the condition and confirming visibility

## Storage adapter changes (`src/lib/storage/`)

- New MIME-type route: integration test uploading a file of that type and verifying URL shape
- Filename hook: integration test confirming filename matches expected pattern

## Migration changes (`src/migrations/`)

- Run the migration locally against a fresh DB: `pnpm payload migrate`
- Run the down migration: confirm it reverses cleanly
- Cross-reference [feedback_d1_pragma_foreign_keys] memory — if you're rebuilding child tables, the parent must be rebuilt first

## RBAC / access (`src/lib/access/`)

- Integration test for each role × resource combination that changed
- Edge cases: missing role, multiple roles, locale-scoped permissions

## What NOT to test

Per `feedback_no_core_payload_tests` memory: don't test built-in Payload behavior like relationship population. Test the project's custom logic, not the framework.

## Test commands (per `.claude/rules/testing-reqs.md`)

```bash
pnpm test:int    # Vitest integration tests
pnpm test:e2e    # Playwright E2E tests
pnpm test        # Both (sequential)
```

**Never** run tests in parallel with build. Never run two test commands at the same time.

## Minimum bar before opening PR

- Acceptance criteria items that can be tested have tests
- `pnpm lint` passes with 0 errors
- `pnpm build` succeeds
- `pnpm test` passes — 0 failures, no new skips
- If pre-existing failures exist on main: fix them in this PR (see `.claude/skills/pr-prep/SKILL.md` fast verification recipe)
