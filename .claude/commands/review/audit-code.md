---
description: Comprehensive code quality audit of entire project
allowed-tools: Bash(find:*), Bash(wc:*), Bash(du:*), Bash(git log:*), Bash(git diff:*), Bash(cat:*), Bash(grep:*), mcp__serena__*, Read, Glob, Grep
model: claude-sonnet-4-5-20250929
---

## Project Health Metrics

- Lines of code: !`find . -name "*.ts" -o -name "*.tsx" | xargs wc -l | tail -1`
- Git contributors: !`git log --since="1 month ago" --format="%an" | sort | uniq -c | sort -rn | head -10`
- Build size: !`du -sh dist/ 2>/dev/null`
- Recent commits: !`git log --oneline --since="2 weeks ago" | wc -l`

## Your Task

You are performing a thorough code review of the WeMeditate Web project. Your goal is to identify concrete, actionable improvements in code quality, performance, security, and maintainability.

## Instructions for Claude

When this command is invoked:

1. **Review project metrics** - Analyze the health metrics provided above
2. **Review recent changes** - Use `git log --oneline -10` and `git diff` to understand recent work
3. **Check critical files** - Read key files in `src/pages/`, `src/lib/queries/`, `src/components/`, and `src/server/`
4. **Apply the checklist below** - Use as a guide, not a rigid script
5. **Provide structured output** - Follow the output format at the end of this document
6. **Prioritize actionable feedback** - Focus on specific file locations and concrete solutions

## What to Look For: Review Checklist

### 1. Code Structure & Organization

**File Structure**
- Files organized per CLAUDE.md (pages/, components/, lib/, server/)
- Vike conventions followed (+Page.tsx, +data.ts, +route.ts)
- Server-only code in src/server/
- Generated code (genql-client) gitignored

**Component Organization**
- Single responsibility principle
- Proper client ('use client') vs server component separation
- No server components importing client-only code

**Import Paths**
- Consistent @/ alias usage (NOT relative ../../../)
- No circular dependencies

### 2. Internationalization (i18n)

**Locale Routing** - Check src/pages/+onBeforeRoute.ts and route files
- Default locale (en) has NO prefix (/ not /en)
- /en/* redirects to /*
- Non-default locales use prefix (/cs/*, /de/*)
- Invalid locales return 404

**Data Fetching** - Check all +data.ts files
- ALL GraphQL queries pass locale parameter
- Use isValidLocale(), getLocalizedPath() from @/lib/i18n
- hasEnglishVersion() used for 404 fallback links

### 3. Data Fetching & GraphQL

**Genql Usage** - Check src/lib/graphql-client.ts and +data.ts files
- Use getGraphQLClient(env) NOT direct genql client
- Queries use TypeScript objects with __args (NOT GraphQL strings)
- Minimal field selection (avoid over-fetching)
- No `any` types

**Query Helpers** - Check src/lib/queries/
- Use helpers like getPageBySlug(), getHomePage(), hasEnglishVersion()
- Pass env to all query functions
- Handle null/undefined gracefully
- Proper try/catch error handling

**Caching** - Check +data.ts files and src/server/cache.ts
- Pass `{ env, kv }` to query helpers
- Preview mode uses `{ skipCache: true }`
- Cache invalidation webhook configured

### 4. Error Handling

**Error Boundaries** - Check src/layouts/LayoutDefault.tsx and src/components/
- Global ErrorBoundary wraps app, ContentErrorBoundary wraps content
- Both call Sentry.captureException() in production
- User-friendly messages, retry/refresh buttons

**404 Handling** - Check +data.ts files
- Use NotFound component from @/components/NotFound
- Return `{ is404: true }` in +data.ts
- Check hasEnglishVersion() for fallback links

**Sentry** - Check src/sentry.browser.config.ts
- Only initialized in production (check import.meta.env.PROD)
- SENTRY_DSN configured
- beforeSend filters sensitive data

### 5. Performance & Optimization

**React Performance** - Check component files
- No unnecessary re-renders (check useMemo, useCallback usage)
- Images optimized, lazy loading for heavy components

**Bundle Size** - Run `pnpm build` and check dist/assets/
- No large dependencies in client bundle
- Source maps deleted after Sentry upload (check vite.config.ts)

**SSR & Data Fetching** - Check +data.ts files
- Critical data in +data.ts (server-side)
- No waterfall requests (use Promise.all for parallel fetching)
- Loading states for async UI

### 6. Security

**CRITICAL: Check for secrets in git**
```bash
git log -p | grep -i "api.key\|secret\|password"
pnpm audit
```

**Environment Variables** - Check .dev.vars, wrangler.toml
- No secrets committed (use .gitignore)
- .dev.vars.example up to date
- VITE_* prefix ONLY for browser-safe values
- Secrets set via `pnpm wrangler secret put`

**API Authentication** - Check src/server/auth.ts
- Use API key (NOT email/password)
- Format: "users API-Key {key}"

**Webhook Security** - Check src/server/cache-invalidation.ts
- Strong WEBHOOK_SECRET (32+ chars)
- Validate x-webhook-secret header
- Return 401 for unauthorized

### 7. TypeScript & Type Safety

- No `any` types (or justified with comments)
- Use `import type` for type-only imports
- PageContext properly typed
- Use Genql generated types

### 8. Testing

**Run tests first:**
```bash
pnpm test
```

- Integration tests cover critical flows (locale routing, 404, preview)
- Tests not flaky (no waitForTimeout)
- Test data setup documented

### 9. Code Style & Quality

**Run linter:**
```bash
pnpm lint
```

- No ESLint errors/warnings
- No commented-out code
- No console.log in production
- No magic numbers/strings (use constants)
- Meaningful names (NOT x, temp, data1)
- camelCase variables, PascalCase components, UPPER_SNAKE_CASE constants

### 10. Project-Specific Patterns

**Query Patterns** - Check src/lib/queries/pages.ts
- Use getPageBySlug(), getHomePage(), hasEnglishVersion()
- Homepage tries 'home' then 'index' slugs
- All queries have try/catch error handling

**Route Patterns** - Check +route.ts files
- Validate locale/slug properly
- Prevent invalid locales (return false)
- /en/* routes redirect to /*

**Live Preview** - Check src/pages/preview/
- useLivePreview hook configured
- Validate URL params (collection, id, locale)
- Use `draft: true` and `skipCache: true`
- Preview banner visible

### 11. Documentation

- CLAUDE.md reflects current implementation
- .dev.vars.example up to date
- TODOs tracked or removed
- Complex logic has "why" comments

## Execution Steps

Follow these steps in order:

### Step 1: Run Automated Checks
```bash
pnpm lint
pnpm test
pnpm build
pnpm audit
git log --oneline -10
```

### Step 2: Review Critical Files
Read and analyze these key files:
- `src/pages/+onCreateGlobalContext.server.ts`
- `src/lib/graphql-client.ts`
- `src/lib/queries/pages.ts`
- `src/server/auth.ts`
- `src/server/cache.ts`
- Recent +data.ts files in src/pages/
- wrangler.toml and .dev.vars.example

### Step 3: Check for Common Issues
Search for patterns that indicate problems:
```bash
# Find relative imports (should use @/ alias)
grep -r "from '\\.\\./\\.\\./" src/

# Find any types (should be avoided)
grep -r ": any" src/

# Find console.log in production code
grep -r "console\\.log" src/

# Find TODO/FIXME comments
grep -r "TODO\|FIXME" src/
```

### Step 4: Security Scan
```bash
# Check for leaked secrets
git log -p | grep -i "api.key\|secret\|password" | head -20

# Dependency vulnerabilities
pnpm audit
```

## Common Issues (Priority Checks)

**High Priority:**
- ⚠️ Secrets exposed with PUBLIC_ENV__* prefix
- ⚠️ Missing locale parameter in GraphQL queries
- ⚠️ Not passing `env` to getGraphQLClient()
- ⚠️ Using `any` types
- ⚠️ Relative imports (../../../) instead of @/ alias

**Medium Priority:**
- Missing null/undefined handling from PayloadCMS
- Not passing `{ env, kv }` to query helpers
- console.log in production code
- Over-fetching GraphQL fields
- Missing error boundaries on new pages

**Low Priority:**
- TODO/FIXME comments
- Missing JSDoc comments
- Suboptimal naming conventions

## Required Output Format

Structure your review EXACTLY like this:

### Summary
Brief 2-3 sentence overview of the codebase's current state and quality.

### Automated Check Results
```
Lint:   [X errors, Y warnings / Clean]
Tests:  [X/Y passing / All passing]
Build:  [Success / Failed - reason]
Bundle: [Xkb client, Ykb server]
Audit:  [X vulnerabilities / None]
```

### Strengths (List 3-5)
- **Category:** Description with specific [file reference](path/to/file.ts:line)

Example:
- **Error Handling:** Comprehensive two-tier error boundary system in [src/layouts/LayoutDefault.tsx:15-30](src/layouts/LayoutDefault.tsx#L15-L30)

### Critical Issues (Fix Immediately)
Security, data loss, or blocking bugs. Include file path, line numbers, problem, and fix:

- **Issue Title** in [src/file.ts:42](src/file.ts#L42)
  - **Problem:** What's wrong and why it's critical
  - **Fix:** Concrete solution with code example if applicable
  ```typescript
  // Suggested fix
  ```

### High Priority Issues (Fix Soon)
Functionality, performance, or maintainability problems:

- **Issue Title** in [src/file.ts:42](src/file.ts#L42)
  - **Problem:** Description
  - **Fix:** Solution

### Medium/Low Priority (Nice to Have)
- **Issue** in [src/file.ts](src/file.ts) - Brief description

### Top 3 Action Items
Prioritized list with effort estimation:

1. **[Action description]** - Priority: Critical - Effort: S/M/L - [src/file.ts:42](src/file.ts#L42)
2. **[Action description]** - Priority: High - Effort: M - [src/file.ts](src/file.ts)
3. **[Action description]** - Priority: Medium - Effort: S - [src/file.ts](src/file.ts)

---

**Review completed:** YYYY-MM-DD
**Files reviewed:** X files across Y directories
**Total issues:** Z (A critical, B high, C medium/low)
