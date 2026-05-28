---
name: implement-issue
description: Implement and test a GitHub issue end-to-end. Reads the issue, plans the work, implements with tests, validates lint/build/test, and opens a PR. User-invoked only — does not run unless explicitly triggered.
argument-hint: '[issue-number]'
disable-model-invocation: true
effort: max
allowed-tools: Bash(*), Read, Edit, Write, Grep, Glob
---

# Implement Issue

End-to-end implementation of a GitHub issue: read → plan → branch → implement → test → PR.

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

If you edited `src/collections/`, `src/fields/`, `src/blocks/`, `src/globals/`, or `src/payload.config.ts`:

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

Run the **lean local gate**. Per `.claude/rules/testing-reqs.md`: never run tests + build in parallel.

```bash
.claude/skills/implement-issue/scripts/validate.sh          # lint + pnpm test:unit
.claude/skills/implement-issue/scripts/validate.sh --full   # mirror CI: lint + full pnpm test + Cloudflare build
```

Or manually (lean gate):

```bash
pnpm lint
pnpm test:unit
pnpm exec vitest run tests/int/<file>.int.spec.ts --config ./vitest.config.mts   # targeted to your change
```

CI (`.github/workflows/ci.yml`) runs the full `pnpm test` suite + the Cloudflare build on the PR — that is the gate. Use `--full` locally only to reproduce a red CI check.

If anything fails (locally or in CI):

- Fix the failure
- Commit the fix as a separate commit
- Re-run validation
- Do NOT mark the PR ready while CI is red

### 9. Push the branch

```bash
git push -u origin <branch>
```

### 10. Open the PR

Write the body to `/tmp/pr-body.md` (preserves markdown), then:

```bash
gh pr create \
  --title "<conventional commit title>" \
  --body-file /tmp/pr-body.md \
  --base main
```

See `pr-template.md` for the body format.

### 11. Report

Output the PR URL to the user. Note any unchecked acceptance criteria the user should verify manually (e.g., UI screenshots, manual repro of edge cases).

## Hard rules

- **Never** force-push to main or any shared branch
- **Never** skip hooks (`--no-verify`)
- **Never** auto-run `pnpm db:migrations:create` — ask the user
- **Never** commit secrets / `.env` / credentials
- **Never** mark a PR ready while CI is red
- **Always** create commits incrementally; never one monolithic commit at the end
- **Always** use `--body-file` for PR creation (preserves markdown)
- **Always** run the lean local gate before opening the PR; CI runs the full suite + Cloudflare build

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
- PR template: `pr-template.md`
- Test types per change: `test-plan-checklist.md`
- Validation script: `scripts/validate.sh`
- Repo conventions: `.claude/skills/draft-ticket/conventions.md`
- Test patterns: `.claude/rules/tests.md`
- PR requirements: `.claude/skills/pr-prep/SKILL.md`
- Migrations: `.claude/rules/migrations.md`
