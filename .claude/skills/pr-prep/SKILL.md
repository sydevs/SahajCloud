---
name: pr-prep
description: Pre-PR validation — runs the Tier 2 lean local gate (lint + unit suite) by default, with --full to reproduce the Tier 3 CI checks (full test suite + Cloudflare build) locally. Use before opening or marking a PR ready for review.
allowed-tools: Bash, Read, Grep
---

# PR Prep

Validates that the current branch is PR-ready. Replaces the always-loaded `.claude/rules/pr-requirements.md` global rule with an explicit, on-demand skill.

The codebase has a **three-tier speed contract** (`.claude/rules/testing-reqs.md`):

| Tier           | Command                                     | Where                                                |
| -------------- | ------------------------------------------- | ---------------------------------------------------- |
| **1 — Hook**   | `pnpm test:unit`                            | Claude PostToolUse on src/** / tests/unit/** (< 5 s) |
| **2 — Pre-PR** | `pnpm lint && pnpm test:unit`               | This skill, by default (< 15 s)                      |
| **3 — CI**     | `pnpm lint && pnpm test && pnpm test:smoke` | GitHub Actions on every PR (≤ 20 min)                |

Tiers 1 and 2 give Claude and the developer fast feedback; Tier 3 owns the slower, cross-cutting checks (full integration suite, Cloudflare PR-preview smoke specs against cloned prod data). This skill's default is Tier 2; `--full` reproduces Tier 3 locally for debugging, **minus smoke** — Playwright smoke specs target a deployed Cloudflare PR preview and don't run locally.

## Quick start

```bash
.claude/skills/pr-prep/check.sh          # Tier 2: lint + pnpm test:unit
.claude/skills/pr-prep/check.sh --full   # Tier 3 locally (no smoke): lint + full pnpm test + Cloudflare build
```

Sequential by design (per `.claude/rules/testing-reqs.md` — never run test/build commands in parallel).

## What to run before opening a PR

**Tier 2 (default, run locally):**

1. **Lint passes**: `pnpm lint` — 0 errors
2. **Unit suite passes**: `pnpm test:unit`
3. **Targeted integration spec(s)** for the area you changed:
   `pnpm exec vitest run tests/int/<file>.int.spec.ts --config ./vitest.config.mts`
4. **Types check** (if type changes): `pnpm tsc --noEmit`

**Tier 3 (automatic on the PR via CI):** the full `pnpm test` suite + the Playwright smoke specs (`pnpm test:smoke`) against a Cloudflare PR preview environment. Don't block locally on these — run `check.sh --full` only to debug a red CI run. Pre-existing failures on `main` still get fixed in your PR (see below).

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

Include a Test Results section. CI (`Lint, Test & Smoke` check on the PR) is the source of truth for Tier 3; summarize local Tier 2 + CI Tier 3 status:

```markdown
## Test Results

- Lint: ✓ No errors
- Tier 2 (lint + unit + targeted int): ✓ passed locally
- Tier 3 (full suite + smoke): ✓ via CI (see PR checks)
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

- During a focused implementation session — Tier 1 (`pnpm test:unit`) already runs in the post-Edit hook for every `src/**` / `tests/unit/**` change. For ad-hoc checks, run `pnpm lint` / `pnpm test:unit` / a targeted `pnpm exec vitest run <file> --config ./vitest.config.mts` directly for tighter feedback loops.
- Use this skill specifically before opening / marking-ready a PR.
