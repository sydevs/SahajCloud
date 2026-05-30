# Bug template

```markdown
## Summary

[One paragraph: the symptom and where it surfaces. Don't theorize about
the cause in the summary — describe what the user/observer sees.]

## Observed behavior

[Exact behavior. Include error messages, screenshots, request/response
samples, stack traces — whatever you have. Quote verbatim.]

## Expected behavior

[What should happen instead.]

## Reproduction

1. [Smallest steps that produce the bug]
2. [...]
3. [...]

Environment:

- [ ] Reproduces in dev (`pnpm devsafe`)
- [ ] Reproduces in production
- [ ] Reproduces in CI
- [ ] Specific user/role/locale required: [details]

## Suspected cause

[Optional. Your best guess at the root cause + file:line refs. Mark as
"suspected" — the implementer should still verify.]

## Acceptance criteria

- [ ] [Specific test or check that proves the bug is fixed]
- [ ] Regression test added (preferably integration test in `tests/int/`)
- [ ] Related code paths reviewed for the same class of bug
- [ ] `pnpm lint`, `pnpm test` pass

## Files likely affected

- `src/...` — [why]

## References

- Sentry: [link if available]
- Related PR / issue: #NNN
```

## Notes for the drafter

- A bug ticket without reproduction steps is half a bug ticket. If you can't reproduce, say so explicitly and ask the reporter for steps.
- For Sentry-reported errors: link the Sentry issue, attach the stack trace.
- For PayloadCMS hook bugs: include the hook name + collection in the title.
- For D1/migration bugs: cross-reference [feedback_d1_pragma_foreign_keys] memory if relevant.
