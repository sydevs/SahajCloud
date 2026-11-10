# MCP Setup

Model Context Protocol servers configured for this project. Configuration lives in
[`.mcp.json`](../.mcp.json) at the project root and is checked into git, so the team shares one
MCP topology.

## Active MCPs

| Server            | Transport    | URL / Command                                    | Auth  | Purpose                                     |
| ----------------- | ------------ | ------------------------------------------------ | ----- | ------------------------------------------- |
| `payloadcms-docs` | (built-in)   | —                                                | None  | Search PayloadCMS 3.0 documentation         |
| `cloudflare-docs` | stdio bridge | `mcp-remote https://docs.mcp.cloudflare.com/mcp` | None  | Search Cloudflare R2 / Stream / Images docs |
| `playwright`      | stdio        | `@playwright/mcp@0.0.84`                         | None  | Run headless-browser checks against the UI  |
| `sentry`          | HTTP         | `https://mcp.sentry.dev/mcp`                     | OAuth | Query production error monitoring           |
| `github`          | HTTP         | `https://api.githubcopilot.com/mcp/`             | OAuth | Search GitHub issues, PRs, and code         |

## Playwright

The server runs headless with `--isolated`: each session starts with a fresh, in-memory browser
profile, so admin cookies never carry over from another session. Click and type by the element
references in `browser_snapshot`, not by CSS selectors. The version is pinned. SahajAtlasWeb and
WeMeditateWeb pin the same version, so bump all three together.

## Authentication

Sentry and GitHub both start their OAuth flow on the first tool call — a browser opens, and the
token then persists locally. Claude Code stores both tokens outside the repo, so `.mcp.json`
holds no secrets.

## Tool prefixes (for permission allow-lists)

- `mcp__payloadcms-docs__*`
- `mcp__cloudflare-docs__*`
- `mcp__playwright__*` — ten tools, allow-listed individually in `.claude/settings.json`:
  `browser_navigate`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_fill_form`,
  `browser_take_screenshot`, `browser_evaluate`, `browser_wait_for`, `browser_console_messages`,
  `browser_close`
- `mcp__sentry__*`
- `mcp__github__*`

## When to use which MCP

| Question                                          | Use                                                                |
| ------------------------------------------------- | ------------------------------------------------------------------ |
| How does PayloadCMS X work?                       | `mcp__payloadcms-docs__*`                                          |
| How does Cloudflare X work?                       | `mcp__cloudflare-docs__*`                                          |
| Did this code path error in production?           | `mcp__sentry__*`                                                   |
| What is the state of PR #N? What issues are open? | `mcp__github__*`                                                   |
| Check a UI change in the running app              | `mcp__playwright__*`, after you start the dev server               |
| Any other research                                | `WebFetch` / `WebSearch` — already allow-listed for common domains |
