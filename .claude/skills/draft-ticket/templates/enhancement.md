# Enhancement / Refactor template

```markdown
## Summary

[1 paragraph: what we're improving and why. Enhancement = behavior change
to existing feature. Refactor = no behavior change, internal structure
only. Be clear which this is.]

## Current state

[How it works today. Reference specific code locations. What's painful
about it?]

## Proposed change

[What the new shape looks like. Include before/after snippets if helpful.]

## Constraints

- [What must NOT break — backward compatibility, data preservation, etc.]
- [Performance / size / latency budgets]
- [Migration path for existing data]

## Acceptance criteria

- [ ] [Testable condition #1]
- [ ] [Testable condition #2]
- [ ] No regressions in existing tests (`pnpm test` passes)
- [ ] [For refactors: behavior verified unchanged by existing tests; no test
      modifications required]

## Files affected

- `src/...` — [what changes]

## References

- Related PR: #NNN
- Discussion: [link]
```

## Notes for the drafter

- **Refactors should be behavior-preserving.** If existing tests need to change, it's no longer a pure refactor — call it out and explain why.
- For large refactors: consider proposing a split — landing the structural change first, then the behavior change.
- For deprecations: include a timeline and a migration path for callers.
- For performance work: include the metric you're optimizing for and the measurement method.
