# Branch naming

## Format

```
<type>/<short-kebab-slug>
```

`<type>` matches the conventional commit type (`feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `perf`).

`<short-kebab-slug>` is 2–5 words drawn from the issue title.

## Examples

| Issue title                                                    | Branch                          |
| -------------------------------------------------------------- | ------------------------------- |
| `feat(api): require select + populate for API client reads`    | `feat/api-client-select`        |
| `fix(api): correct select/populate REST format docs + tests`   | `fix/select-populate-rest-docs` |
| `refactor(translations): individual fields + TranslationsRow`  | `refactor/translations-rows`    |
| `chore(claude-hooks): audit and rewrite hook config`           | `chore/claude-hooks-audit`      |
| `Make it possible to change userChoice icon after creating it` | `feat/userchoice-icon-edit`     |
| `Remove public-facing meditation titles from the CMS`          | `feat/hide-meditation-title`    |

## Rules

- Lowercase, kebab-case
- No issue numbers in the branch name (they go in the commit body)
- 2–5 words from the title — long enough to be recognizable, short enough to type
- Drop articles ("the", "a") and filler words
- If the issue has no clear scope, use the area (`api`, `admin`, `migrations`, ...)

## Branch from where

Always from latest `main` unless the user says otherwise:

```bash
git fetch origin main
git checkout main
git pull
git checkout -b <type>/<slug>
```

## When the branch name is taken

If `git checkout -b` fails because the branch exists locally or remotely:

- **Local exists, no commits:** delete it (`git branch -d`) and re-create
- **Local exists with commits:** ask the user — they may have unfinished work
- **Remote exists:** ask the user — may be an existing PR

Never silently force-overwrite an existing branch.
