---
name: implement-issue
description: Implement and test a GitHub issue end-to-end. Reads the issue, plans the work, implements with tests, validates lint/build/test, and opens a PR. User-invoked only — does not run unless explicitly triggered.
argument-hint: '[issue-number]'
disable-model-invocation: true
effort: max
allowed-tools: Bash(*), Read, Edit, Write, Grep, Glob, Task
---

# Implement Issue

End-to-end implementation of a GitHub issue: read → plan → branch → implement → test → **finalize** (simplify → review → push → PR → CI). The finalize pipeline is the shared `/finalize-pr` skill.

## Invocation

```
/implement-issue 419
```

## Workflow

### 1. Verify clean working tree

```bash
git status
```

If there are uncommitted changes that aren't yours, **stop**. Ask the user whether to stash or proceed. Never silently overwrite their work.

### 2. Fetch the issue

```bash
gh issue view "$ISSUE" --json number,title,body,labels,assignees
```

Read it fully. Identify:

- Acceptance criteria (checklist at the bottom)
- Files-affected list (if present)
- Whether a migration is implied
- Whether tests are explicitly required

If the issue lacks acceptance criteria, **ask the user** what "done" looks like before starting. Don't guess.

### 3. Plan the work

Lay out the plan in the conversation before touching code:

- Files to create / modify
- Order of changes
- Whether tests need to be written (almost always yes)
- Migration step (if schema changes)
- Estimated number of commits

Ask the user to confirm the plan. Iterate until aligned.

### 4. Create a branch

See `branch-naming.md` for naming. Format:

```bash
git checkout -b <type>/<short-slug>
# e.g., git checkout -b feat/meditation-subtitle
# e.g., git checkout -b fix/select-populate-rest-docs
```

Branch from `main` unless the user specifies otherwise. Pull latest first:

```bash
git fetch origin main && git checkout main && git pull && git checkout -b <branch>
```

### 5. Implement

One unit of change at a time. After each meaningful unit:

```bash
git add <files>
git commit -m "<conventional commit message>"
```

**Commit message rules** (see `.claude/skills/draft-ticket/conventions.md`):

- `<type>(<scope>): <subject>` — same format as the issue title
- Imperative mood, ≤ 70 chars, lowercase subject
- Reference the issue in body, not subject: `Refs #419` or `Closes #419` in the body
- Use the `Co-Authored-By` line from CLAUDE.md's commit guidance

**HEREDOC for multi-line bodies** — always:

```bash
git commit -m "$(cat <<'EOF'
feat(api): add subtitle field to meditation

Closes #419

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### 6. Schema changes (if any)

If you edited `src/collections/`, `src/fields/`, `src/lib/richEditor/blocks/`, `src/globals/`, or `src/payload.config.ts`:

- The `payload-types-gen` PostToolUse hook should regenerate `src/payload-types.ts` automatically.
- **Migration required**: do NOT run `pnpm db:migrations:create` yourself — it's interactive and hangs when piped. **Ask the user to run it.**
- After the user creates the migration, commit the migration files in a separate commit:
  ```bash
  git add src/migrations/
  git commit -m "chore(migrations): add migration for <change>"
  ```
- See `.claude/rules/migrations.md` for the full migration workflow.

### 7. Write tests

For each acceptance-criterion item that can be tested:

- **Integration test** (`tests/int/`, Vitest) — preferred for collection / endpoint / business-logic changes
- **E2E test** (`tests/e2e/`, Playwright) — for admin UI flows or full request paths
- **Unit test** — for pure functions in `src/lib/`

See `test-plan-checklist.md` for what to test per change type. Reference `.claude/rules/tests.md` for patterns.

### 8. Validate

Run the **lean local gate** as you implement. Per `.claude/rules/testing-reqs.md`: never run tests + build in parallel.

```bash
.claude/skills/pr-prep/check.sh          # lint + pnpm test:unit (Tier 2)
.claude/skills/pr-prep/check.sh --full   # mirror CI locally: lint + full pnpm test + build
```

Or manually (lean gate):

```bash
pnpm lint
pnpm test:unit
pnpm exec vitest run tests/int/<file>.int.spec.ts --config ./vitest.config.mts   # targeted to your change
```

Fix any failure and commit the fix as a separate commit before moving on. The full CI gate runs in the finalize step (step 9); use `--full` locally only to debug a red CI run.

### 9. Finalize — run the ship pipeline

Implementation is done and validated. Now ship it via the **finalize pipeline**: **follow every step in `.claude/skills/finalize-pr/SKILL.md`** — simplify → single `/code-review` → conditional `/security-review` → lean test gate → push → open the PR → watch CI (with fixes) → report. On this first run it **creates** the PR.

Execute that skill's steps directly here; don't re-implement them in this file — `finalize-pr` is the single source of truth, so the exact same pipeline runs whether the user types `/finalize-pr` or `/implement-issue`.

### 10. Hand off to the Adjust phase

Once the PR is open and CI is green, report the PR URL, CI status, and any manual-verification items (UI screenshots, edge cases). Then note that we're now in the **Adjust phase**: further changes are committed locally as we go but **not pushed**; the user runs `/finalize-pr` again when the PR is ready to re-review and re-run CI. See the "PR workflow" section in `AGENTS.md`.

## Hard rules

- **Never** force-push to main or any shared branch
- **Never** skip hooks (`--no-verify`)
- **Never** auto-run `pnpm db:migrations:create` — ask the user
- **Never** commit secrets / `.env` / credentials
- **Always** create commits incrementally; never one monolithic commit at the end
- **Always** run the lean local gate (`.claude/skills/pr-prep/check.sh`) as you implement
- **Always** ship via the finalize pipeline (`.claude/skills/finalize-pr/SKILL.md`) — never hand-roll the push/PR/CI steps here, and never report the PR ready while CI is red

## Edge cases

### Issue is too vague

If acceptance criteria are missing or ambiguous, stop at step 3 and ask the user. Don't draft your own ACs and proceed — better to clarify.

### Existing PR for this issue

Run `gh pr list --search "in:title <keyword>"` before step 4. If a PR already exists, ask the user whether to extend it (check it out) or open a new one.

### Pre-existing test failures on main

Per `.claude/skills/pr-prep/SKILL.md`: fix them in your PR. Use the "fast verification recipe" in that skill to confirm the failure pre-dates your work.

### Schema change but the user doesn't want a migration yet

Reset the schema edits, surface the change as a follow-up issue, and proceed with the non-schema portion only.

## References

- Branch naming: `branch-naming.md`
- Test types per change: `test-plan-checklist.md`
- Lean gate: `.claude/skills/pr-prep/check.sh`
- Finalize pipeline (simplify → review → push → PR → CI): `.claude/skills/finalize-pr/SKILL.md`
- PR body template: `.claude/skills/finalize-pr/pr-template.md`
- Repo conventions: `.claude/skills/draft-ticket/conventions.md`
- Test patterns: `.claude/rules/tests.md`
- PR requirements / pre-existing failures: `.claude/skills/pr-prep/SKILL.md`
- Migrations: `.claude/rules/migrations.md`
