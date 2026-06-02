---
name: review-pr
description: Conduct a code review of a GitHub pull request. Reads the PR diff and linked issue, walks file-by-file, checks against project conventions, and dispatches specialized review to security-reviewer / migration-reviewer subagents when warranted. Produces severity-ranked findings. User-invoked.
argument-hint: '[pr-number]'
disable-model-invocation: true
effort: high
allowed-tools: Bash(gh pr:*), Bash(gh issue:*), Bash(git diff:*), Bash(git log:*), Bash(git show:*), Read, Grep, Glob, WebFetch
---

# Review PR

End-to-end code review for the sy-devs-cms repo. Tailored to the PayloadCMS + Next.js + Cloudflare Workers stack and the project's conventions.

## Invocation

```
/review-pr 419
```

Or against an arbitrary PR URL — pass the number; PRs from forks work the same way through `gh`.

## Workflow

### 1. Gather PR context

```bash
gh pr view "$PR" --json number,title,body,author,labels,baseRefName,headRefName,commits
gh pr diff "$PR"
```

If the PR closes an issue (`Closes #N` in body), also read the issue:

```bash
gh issue view "$N" --json title,body
```

The issue defines what "done" looks like — read it before judging the PR.

### 2. Survey the diff

Walk through the changed files. Identify:

- **Touched subsystems** — collections / access / API / admin UI / migrations / storage / etc.
- **Schema changes** — anything in `src/collections/`, `src/fields/`, `src/blocks/`, `src/globals/`, `src/payload.config.ts`
- **New migrations** — files in `src/migrations/`
- **New tests** — files in `tests/`
- **Auth / access changes** — files in `src/lib/access/`, `src/collections/{Clients,Managers}/`, `src/lib/usage/`

This survey determines which checks to apply and whether to dispatch to specialized subagents.

### 3. Dispatch specialized review (parallel)

For PRs that touch high-risk areas, spawn subagents in parallel:

- **Auth / RBAC / credentials / external integrations** → `security-reviewer` (Opus)
- **Migrations** → `migration-reviewer` (Sonnet) on the new migration file(s)

Call them via the Agent tool in a single message so they run in parallel. Wait for both to complete, then incorporate findings into the final review.

### 4. Walk the diff, file by file

For each file, check:

- **Correctness**: does this do what the issue (or commit message) says?
- **Project conventions**: does it follow `.claude/rules/<area>.md` for the affected paths?
- **Tests**: are new behaviors covered? Reference `.claude/skills/implement-issue/test-plan-checklist.md` for what to test per change type.
- **Code quality**: naming, abstractions, dead code, redundant defensive code
- **Edge cases**: null/undefined handling, error paths, locale variations
- **Breaking changes**: is anything removed or renamed that other code/tests depend on?

### 5. Check the PR meta

- **Title**: conventional commit format? See `.claude/skills/draft-ticket/conventions.md`.
- **Description**: matches the format in `.claude/skills/implement-issue/pr-template.md`? Has Test Results section?
- **Closes #**: linked correctly?
- **Commits**: meaningful and incremental, or one monolithic commit?
- **CI**: passing? `gh pr checks <PR>` to inspect.

### 6. Stack-specific gotchas to look for

| Area               | Common issue                                                                                               |
| ------------------ | ---------------------------------------------------------------------------------------------------------- |
| Payload hooks      | Hook mutates but doesn't return data → silently drops change                                               |
| Payload access     | Mixed up boolean vs Where-clause return → bypass or denial                                                 |
| D1 migrations      | Child-then-parent FK rebuild → cascade-null (see [feedback_d1_pragma_foreign_keys])                        |
| `payload-types.ts` | Schema changed but types not regenerated → TS drift                                                        |
| `importMap.js`     | New admin component added but not in import map                                                            |
| Locale handling    | New field added but not wired up in all required locales                                                   |
| API clients        | Missing `select` / `populate` in REST queries (see `src/lib/usage/hooks.ts:validateClientQueryParamsHook`) |
| Cloudflare Workers | Binding referenced but not declared in `wrangler.toml`                                                     |
| Tests              | Mocking the database in integration tests (see [feedback_no_core_payload_tests])                           |

### 7. Compose the review

Organize findings by severity:

```markdown
## Review: PR #<N> — <title>

### Critical (block merge)

- **[Issue]** — `file.ts:42`
  - **What:** [Concrete description]
  - **Why:** [Impact / failure mode]
  - **Fix:** [Specific change]

### High

- ...

### Medium

- ...

### Low / nits

- ...

### Test coverage

[Per-acceptance-criterion check: is each AC tested?]

### Verified safe

- [Non-obvious areas I checked that look correct]

### Verdict

- ✅ Approve, OR
- 💬 Comment (non-blocking feedback), OR
- 🔴 Request changes
```

### 8. Output the review

By default: **print the review to the conversation**. Do NOT auto-post to GitHub.

If the user explicitly asks you to post the review:

```bash
# Approve / comment / request-changes
gh pr review "$PR" --comment --body-file /tmp/pr-review-body.md
gh pr review "$PR" --approve --body-file /tmp/pr-review-body.md
gh pr review "$PR" --request-changes --body-file /tmp/pr-review-body.md
```

For inline comments (specific lines), `gh pr` doesn't support those directly — use the GitHub MCP (`mcp__github__*`) or note the lines in the body for the user to add manually.

## Scope rules

- **One PR per invocation.** Don't review chains of PRs in one shot.
- **Be specific.** Cite `file.ts:line`, not "the access layer". Severity rankings need justification.
- **Don't add nits when there are criticals.** Lead with the must-fix items.
- **Honor the issue scope.** If a PR is intentionally scoped down (e.g., "docs + tests only"), don't flag missing implementation.

## What this skill does NOT do

- Modify the PR's code (use `/implement-issue` or `/fix-bug` for that)
- Auto-approve / auto-request-changes (user must explicitly request posting)
- Run the test suite (the PR author already did; checks visible via `gh pr checks`)

## References

- Project conventions: `.claude/skills/draft-ticket/conventions.md`
- Per-area rules: `.claude/rules/<area>.md` (path-scoped, will auto-load as you read affected files)
- PR template: `.claude/skills/implement-issue/pr-template.md`
- Security review: `.claude/agents/security-reviewer.md` (dispatch to this subagent)
- Migration review: `.claude/agents/migration-reviewer.md` (dispatch to this subagent)
- Pre-PR validation: `.claude/skills/pr-prep/SKILL.md` (what the author should have run)
