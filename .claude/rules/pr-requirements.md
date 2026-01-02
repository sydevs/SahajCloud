# PR Completion Requirements

Before creating or marking a PR as ready for review:

## Required Checks

1. **Full test suite passes**: `pnpm test`
   - All tests must pass (0 failures)
   - No skipped tests - fix them or remove with justification
   - Fix pre-existing failures as part of the PR

2. **Build succeeds**: `pnpm build`

3. **Linting passes**: `pnpm lint` with no errors

4. **Types check**: `pnpm tsc --noEmit` (if type changes)

## Pre-existing Test Failures

If you discover failing tests on `main`:
- **Do not ignore them** - fix as part of your PR
- Create separate commit if fix is unrelated to feature
- Document in PR description

## PR Description Format

Include test results summary:
```markdown
## Test Results
- Integration tests: X passed
- E2E tests: X passed
- Build: ✓ Success
```

## Documentation Sync

For PRs that change architecture or APIs:
- Check if `.claude/docs/` references need updating
- Check if `.claude/rules/` patterns need updating
- Update any code examples that reference changed functions
- Run `pnpm generate:access` if RBAC config changes

## Quick Verification Commands

```bash
pnpm lint && pnpm build && pnpm test
```
