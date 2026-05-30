---
name: draft-ticket
description: Draft a GitHub issue from a feature request, bug report, or enhancement. Creates a formatted issue body with acceptance criteria, test plan, and implementation notes. User-invoked only — does not create the issue without explicit approval.
disable-model-invocation: true
allowed-tools: Bash(gh issue create:*), Bash(gh issue view:*), Bash(gh issue list:*), Bash(gh pr list:*), Bash(gh pr view:*), Bash(git log:*), Bash(git diff:*), Bash(cat:*), Bash(tee:*), Read, Grep, Glob
---

# Draft Ticket

Draft a well-formed GitHub issue for the sy-devs-cms repo. Matches the repo's conventional commits + acceptance-criteria + test-plan style.

## Workflow

1. **Classify the request.** Feature / bug / refactor / enhancement / docs.
2. **Gather context.** Read related code, recent PRs (`gh pr list --limit 20`), and similar past issues (`gh issue list --search "<keyword>"`). Don't draft blindly.
3. **Ask clarifying questions** when scope is ambiguous. Better to ask than to draft the wrong ticket. Common gaps: which collection / locale / user role is affected, expected vs. actual behavior, what "done" looks like.
4. **Choose a template** from `templates/` (feature, bug, enhancement) and adapt.
5. **Write the title** using conventional commit format. See `conventions.md` for the scopes in use.
6. **Write the body.** Be specific. Use file:line refs. Avoid vague language ("improve X", "make Y better").
7. **Preview to user.** Show the full title + body. Ask for sign-off explicitly. **Do NOT call `gh issue create` until the user approves.**
8. **Create the issue.** Write the body to `/tmp/gh-issue-body.md`, then:
   ```bash
   gh issue create --title "<title>" --body-file /tmp/gh-issue-body.md
   ```
   (File-based approach preserves markdown fidelity — `--body` mangles backticks and indentation.)
9. **Return the issue URL** to the user.

## Title format

Conventional commit format:

```
<type>(<scope>): <subject>
```

Examples from this repo's recent history:

- `feat(api): require select + populate for API client reads`
- `fix(api): correct select/populate REST format docs + tests`
- `refactor(translations): individual fields + TranslationsRow component`
- `chore(claude-hooks): audit and rewrite hook config`

Title ≤ 70 chars. Subject in imperative mood ("add", not "added" / "adds").

## Body structure

See `templates/<type>.md` for full templates. All issues should have:

- `## Summary` — one paragraph: what + why
- Either `## Proposed changes` (for features/refactors) or `## Observed behavior` / `## Expected behavior` (for bugs)
- `## Acceptance criteria` — markdown checklist of testable conditions
- `## Files affected` (optional) — the files you'd expect a PR to touch
- `## References` (optional) — related PRs, prior issues, external docs

## Quality bar

A good ticket can be implemented by someone who wasn't in the room when it was discussed. Bad tickets cause back-and-forth in PR review.

**Watch for:**

- "Improve X" / "make Y better" — what's the measurable end state?
- Missing acceptance criteria — how does the implementer know they're done?
- No reproduction steps (bugs) — describe the smallest path to the symptom
- Scope creep — if the body covers 3 features, draft 3 tickets

## References

- Conventional commit scopes used in this repo: `conventions.md`
- Real well-formed examples from this repo: `examples/well-formed-issues.md`
- Test-plan format expected in PR descriptions: `.claude/skills/pr-prep/SKILL.md`
