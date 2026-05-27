# MCP Setup

Model Context Protocol servers configured for this project. Configuration lives in [`.mcp.json`](../../.mcp.json) (project root) and is checked into git so the team shares the same MCP topology.

## Active MCPs

| Server            | Transport    | URL / Command                                    | Auth  | Purpose                                                    |
| ----------------- | ------------ | ------------------------------------------------ | ----- | ---------------------------------------------------------- |
| `payloadcms-docs` | (built-in)   | —                                                | None  | Search PayloadCMS 3.0 documentation                        |
| `cloudflare-docs` | stdio bridge | `mcp-remote https://docs.mcp.cloudflare.com/mcp` | None  | Search Cloudflare Workers / D1 / R2 / Stream / Images docs |
| `puppeteer`       | stdio        | `puppeteer-mcp-server`                           | None  | Headless browser automation for UI verification            |
| `sentry`          | HTTP         | `https://mcp.sentry.dev/mcp`                     | OAuth | Query production error monitoring                          |
| `github`          | HTTP         | `https://api.githubcopilot.com/mcp/`             | OAuth | Structured GitHub issue / PR / code search                 |

## Authentication

| Server   | How to authenticate                                                                               |
| -------- | ------------------------------------------------------------------------------------------------- |
| `sentry` | Triggered automatically on first tool call. Browser opens an OAuth flow; tokens persist locally.  |
| `github` | Same OAuth pattern as Sentry. Use a personal account or org account with appropriate repo access. |

The OAuth tokens are stored by Claude Code outside the repo (no secrets in `.mcp.json`).

## Tool prefixes (for permission allow-lists)

- `mcp__payloadcms-docs__*`
- `mcp__cloudflare-docs__*`
- `mcp__puppeteer__*` — five tools allow-listed individually in `.claude/settings.json`:
  - `puppeteer_navigate`, `puppeteer_fill`, `puppeteer_screenshot`, `puppeteer_click`, `puppeteer_evaluate`
- `mcp__sentry__*`
- `mcp__github__*`

## Disabled MCPs (in `disabledMcpjsonServers`)

| Server   | Reason                                                                                     |
| -------- | ------------------------------------------------------------------------------------------ |
| `serena` | Code-intelligence MCP — Claude Code's built-in Read/Grep/Glob are sufficient for this repo |

## When to use which MCP

| Question                                     | Use                                                                    |
| -------------------------------------------- | ---------------------------------------------------------------------- |
| How does PayloadCMS X work?                  | `mcp__payloadcms-docs__*`                                              |
| How does Cloudflare X work?                  | `mcp__cloudflare-docs__*`                                              |
| Has this code path errored in production?    | `mcp__sentry__*`                                                       |
| What's the state of PR #N? List open issues? | `mcp__github__*`                                                       |
| Verify a UI change in the running app        | `mcp__puppeteer__*` (after starting the dev server)                    |
| All other research                           | `WebFetch` / `WebSearch` (already allow-listed for the common domains) |
