---
name: pr-prep
description: Pre-PR validation — runs lint, build, and the test suite sequentially. Use before opening or marking a PR ready for review. Encapsulates the project's PR completion requirements.
allowed-tools: Bash, Read, Grep
---

# PR Prep

Validates that the current branch is PR-ready. Replaces the always-loaded `.claude/rules/pr-requirements.md` global rule with an explicit, on-demand skill.

## Quick start

```bash
.claude/skills/pr-prep/check.sh
```

Runs `pnpm lint && pnpm build && pnpm test` sequentially (per `.claude/rules/testing-reqs.md` — never in parallel).

## Required checks before opening a PR

1. **Lint passes**: `pnpm lint` — 0 errors
2. **Build succeeds**: `pnpm build`
3. **Full test suite passes**: `pnpm test`
   - 0 failures
   - No skipped tests — fix them or remove with justification
   - Fix pre-existing failures from `main` as part of the PR (see below)
4. **Types check** (if type changes): `pnpm tsc --noEmit`

## Handling pre-existing test failures on `main`

If you discover failing tests that already exist on `main`:

- **Do not ignore them** — fix as part of your PR
- Create a separate commit if the fix is unrelated to your feature
- Document the fix in the PR description

### Fast verification recipe

Confirm a failure pre-exists on `main` without losing working changes:

```bash
git stash
git checkout main -- tests/int/<failing-file>.int.spec.ts
pnpm exec vitest run tests/int/<failing-file>.int.spec.ts
# observe the same failure → it's pre-existing
git checkout <your-branch> -- tests/int/<failing-file>.int.spec.ts
git stash pop
```

Swaps just the single test file to its `main` version, re-runs it, then restores everything. Takes ~10 seconds.

## PR description format

Include a Test Results section:

```markdown
## Test Results

- Integration tests: X passed
- E2E tests: Y passed
- Build: ✓ Success
- Lint: ✓ No errors
```

## Documentation sync for architectural / API PRs

If your PR changes architecture or APIs:

- Check if `.claude/docs/` references need updating
- Check if `.claude/rules/` patterns need updating
- Update code examples that reference changed functions
- Run `pnpm generate:access` if RBAC config changes

## CPU resource management (also documented in `.claude/rules/testing-reqs.md`)

- **Never run multiple test commands in parallel** — wait for one to complete before starting another
- **Don't run tests concurrently with builds** — `pnpm build` and `pnpm test` should not run simultaneously
- Vitest handles internal parallelization efficiently; external parallelization causes CPU overload

## When NOT to use this skill

- During a focused implementation session — run `pnpm lint` / `pnpm test:int` directly for tighter feedback loops
- Use this skill specifically before opening / marking-ready a PR
