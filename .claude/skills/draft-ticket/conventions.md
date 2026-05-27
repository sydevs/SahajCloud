# Repo Conventions

## Conventional commits

Format: `<type>(<scope>): <subject>`

### Types

| Type       | When to use                                  |
| ---------- | -------------------------------------------- |
| `feat`     | New user-facing feature or behavior          |
| `fix`      | Bug fix                                      |
| `refactor` | Internal restructure with no behavior change |
| `chore`    | Tooling, config, dependencies, infra         |
| `docs`     | Documentation only                           |
| `test`     | Test additions/changes only                  |
| `perf`     | Performance improvements                     |

### Scopes seen in this repo

(From recent `git log` — extend as new areas appear.)

- `api` — REST endpoints, query params, OpenAPI
- `access` — RBAC, Managers, Clients, access functions
- `lectures` — Lectures collection / endpoints
- `meditations` — Meditations collection / endpoints
- `frames` — Frames collection, video editor
- `albums` — Albums + Songs
- `app-cards` — AppCards collection, mobile-card logic
- `translations` — Translation globals + UI
- `claude-hooks` — `.claude/hooks/*`
- `e2e` — Playwright E2E tests
- `migrations` — Schema migrations
- `storage` — Cloudflare Images / Stream / R2 adapters
- `admin` — Payload admin UI components
- `seed` — Seed scripts

### Title rules

- Imperative mood: "add", not "added" / "adds"
- ≤ 70 characters
- No trailing period
- Lowercase subject (after the colon)
- Closes refs go in body, not title: `(closes #NNN)` is acceptable in title when concise

### Examples (good)

- `feat(api): require select + populate for API client reads`
- `fix(api): correct select/populate REST format docs + tests`
- `refactor(translations): individual fields + TranslationsRow component`
- `chore(claude-hooks): audit and rewrite hook config`
- `feat(lectures): split into Lectures + LectureClips`

### Examples (avoid)

- ❌ `Updates` (vague, no scope, no type)
- ❌ `feat: stuff` (no scope, vague subject)
- ❌ `fix(api): Fixed a really annoying bug where the user...` (over 70 chars, past tense)

## Issue title format

Same as commit format. The implementer can use the issue title verbatim as their PR title.

## PR description format

Required sections (per `.claude/skills/pr-prep/SKILL.md`):

```markdown
## Summary

[1-3 bullets]

## Test plan / Test Results

- Integration tests: X passed
- E2E tests: Y passed
- Build: ✓ Success
- Lint: ✓ No errors

Closes #NNN
```
