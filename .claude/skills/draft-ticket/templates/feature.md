# Feature template

```markdown
## Summary

[1-2 paragraphs: what we're adding and why. Lead with the user-facing
behavior, not implementation. Reference any prior discussion / PR / issue
that motivates this.]

## Background

[Optional. Why now? What changed? What constraints inform the design?
Skip if the Summary covers it.]

## Proposed changes

### 1. [First concrete change]

[Specifics: which files, which behavior. Use file:line refs where helpful.]

### 2. [Next concrete change]

[...]

## Acceptance criteria

- [ ] [Testable condition #1 — phrased so a reviewer can check it]
- [ ] [Testable condition #2]
- [ ] [...]
- [ ] `pnpm lint`, `pnpm generate:types`, `pnpm test` all pass

## Files affected

- `src/collections/X.ts` — [what changes]
- `src/lib/Y.ts` — [what changes]
- (new) `src/components/Z.tsx` — [purpose]

## References

- Related PR: #NNN
- Related issue: #NNN
- External docs: <url>
```

## Notes for the drafter

- For schema changes: include "Migration required" near the top so the implementer doesn't forget.
- For new admin components: link to `.claude/rules/admin-ui.md` for server/client patterns.
- For new endpoints: include the expected URL shape and the Payload auth model (`/api/...` vs. `src/collections/<Name>/endpoints/`).
- For Railway deployment: call out environment variables needed in Railway service settings or secrets.
