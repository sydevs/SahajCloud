# PR template

Use this for the body of `gh pr create --body-file /tmp/pr-body.md`.

```markdown
## Summary

[2-3 bullets on what changed and why. Focus on user-facing or
behavior-level outcomes, not implementation details.]

- [bullet 1]
- [bullet 2]
- [bullet 3]

## Changes

[Optional. Only include if non-obvious from the file list. Useful for
multi-file refactors where the structural change isn't apparent from
individual diffs.]

- `src/lib/X.ts` — [what changes]
- `src/collections/Y.ts` — [what changes]

## Migration

[Include this section ONLY if a migration was added. Otherwise delete it.]

- New migration: `src/migrations/<timestamp>_<name>.ts`
- Impact: [tables affected, data preserved/transformed]
- Reversible: yes / no — [explain]

## Test Results

- Integration tests: X passed (of Y total)
- E2E tests: X passed (of Y total) — _or_ "N/A — no UI changes"
- Build: ✓ Success
- Lint: ✓ No errors

## Manual verification (optional)

[Steps the reviewer should do to manually verify, if anything can't be
covered by automated tests. Usually for UI changes, content workflows, or
edge cases.]

1. [step]
2. [step]

## Screenshots (optional)

[For UI changes. Drop screenshots inline using GitHub's image upload.]

## Notes for reviewer

[Anything non-obvious — alternative approaches considered, known
follow-ups, areas that need extra scrutiny.]

Closes #NNN

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

## Title

Same as the issue title (`<type>(<scope>): <subject>`), or close to it. Implementer's discretion if the scope shifted during implementation.

## Length

- Summary: 2–3 bullets, ≤ 100 chars each
- Test Results: factual, no editorializing
- Manual verification: only when relevant — don't pad

A short, focused PR description with passing tests beats a long PR description that's vague about test results.

## Avoid in PR descriptions

- ❌ Restating what each commit did (the commit list is right there)
- ❌ "This should fix the bug" — say what it does, not what you hope
- ❌ "Made some refactors" — be specific or omit
- ❌ Repeating the acceptance criteria verbatim — the issue links via `Closes #` already
