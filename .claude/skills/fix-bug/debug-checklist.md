# Debug Checklist

General diagnostic flow when narrowing a bug. Work top-down — early steps are cheap, later steps are expensive.

## 1. Verify the bug exists in the current code

- Is the user on `main` or a feature branch? Check `git status` and `git log -1`.
- Was the file recently changed? `git log -p <file>` shows recent edits.
- Are local changes uncommitted? `git diff` and `git diff --staged`.

## 2. Confirm what's actually happening

- Read the actual error message + stack trace, line by line. Don't skip.
- For client errors: open browser devtools (Network, Console).
- For server errors: tail `.claude/skills/dev-server/state/server.log`.
- For Sentry-reported errors: query `mcp__sentry__*` for full event payload.

## 3. Reproduce

- Smallest steps that produce the error. Write them down explicitly.
- Does it reproduce in a fresh session? After `pnpm devsafe`?
- Does it reproduce against a clean DB? See `/reset-db`.

## 4. Check the obvious

- Is `pnpm install` current? (`pnpm install --frozen-lockfile`)
- Are types fresh? (`pnpm generate:types`)
- Is the dev server healthy? (`.claude/skills/dev-server/dev-server.sh status`)
- Are env vars set? Look in `.env`; check Zod errors at module load (`src/lib/env.ts`).

## 5. Stack-specific patterns

- **PayloadCMS errors** → `payload-errors.md`
- **Cloudflare/D1/R2 errors** → `cloudflare-errors.md`
- **Lint/TypeScript errors** → `pnpm lint`, `pnpm tsc --noEmit`
- **Build errors** → `pnpm build` (consumes CPU; never run with tests)

## 6. Bisect when stuck

- If a test was passing yesterday: `git bisect start && git bisect bad HEAD && git bisect good <last-known-good>`
- Re-run the failing test at each bisect step until you find the breaking commit.

## 7. Library behavior surprises

Before theorizing about how a third-party plugin works, **read its source** in `node_modules/`:

```bash
ls node_modules/<pkg>/dist/
```

PayloadCMS plugins, Next.js internals, and Cloudflare SDKs often differ from their docs. The cloud-storage `handleUpload` return-value contract is a classic example (see `.claude/rules/storage.md`).

## 8. Anti-patterns to avoid

- **Silencing the symptom**: `?.`, `try { ... } catch {}`, broad `as any`. Find why.
- **Defensive validation in internal code**: only validate at system boundaries (user input, external APIs).
- **Resetting state to make it go away**: `rm -rf node_modules` is rarely the actual fix.
- **`--no-verify`** or skipping hooks: never. If a hook fails, fix the hook or fix the code.
