---
name: pr-prep
description: Pre-PR validation — runs the lean local gate (lint + unit suite) by default, with --full to reproduce the CI checks (full test suite + Cloudflare build) locally. Use before opening or marking a PR ready for review.
allowed-tools: Bash, Read, Grep
---

# PR Prep

Validates that the current branch is PR-ready. Replaces the always-loaded `.claude/rules/pr-requirements.md` global rule with an explicit, on-demand skill.

**The full test suite and the Cloudflare build run in CI on every PR** (`.github/workflows/ci.yml`). This skill's default is the **lean local gate**; CI owns the slower, cross-cutting checks.

## Quick start

```bash
.claude/skills/pr-prep/check.sh          # lean gate: lint + pnpm test:unit
.claude/skills/pr-prep/check.sh --full   # reproduce CI locally: lint + full pnpm test + Cloudflare build
```

Sequential by design (per `.claude/rules/testing-reqs.md` — never run test/build commands in parallel).

## What to run before opening a PR

**Locally (lean gate):**

1. **Lint passes**: `pnpm lint` — 0 errors
2. **Unit suite passes**: `pnpm test:unit`
3. **Targeted integration spec(s)** for the area you changed:
   `pnpm exec vitest run tests/int/<file>.int.spec.ts --config ./vitest.config.mts`
4. **Types check** (if type changes): `pnpm tsc --noEmit`

**In CI (automatic on the PR):** the full `pnpm test` suite and the Cloudflare build (`opennextjs-cloudflare build`). Don't block locally on these — run `check.sh --full` only to debug a red CI run. Pre-existing failures on `main` still get fixed in your PR (see below).

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

Include a Test Results section. CI (`Lint & Test` + `Cloudflare Build` checks on the PR) is the source of truth for the full suite and build; summarize local + CI status:

```markdown
## Test Results

- Lint: ✓ No errors
- Unit + targeted integration (local): ✓ passed
- Full suite + Cloudflare build: ✓ via CI (see PR checks)
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

- During a focused implementation session — run `pnpm lint` / `pnpm test:unit` / a targeted `pnpm exec vitest run <file> --config ./vitest.config.mts` directly for tighter feedback loops
- Use this skill specifically before opening / marking-ready a PR
