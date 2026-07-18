#!/usr/bin/env node

/**
 * Block Wrong Bash Commands Hook (PreToolUse / Bash)
 *
 * Denies common wrong invocations and tells Claude the right one instead.
 * Saves tokens by failing fast rather than letting Claude try, fail, retry.
 */

import { readFileSync } from 'fs'
import { homedir } from 'os'
import { isAbsolute, resolve, sep } from 'path'

const input = JSON.parse(readFileSync(0, 'utf-8'))
const command = input?.tool_input?.command ?? ''

if (!command) {
  process.exit(0)
}

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()

/** Strip quotes, expand `~`, and resolve relative paths against the project dir. */
function resolvePath(raw) {
  if (!raw) return null
  let p = raw.trim().replace(/^['"]|['"]$/g, '')
  if (p === '~') p = homedir()
  else if (p.startsWith('~/')) p = homedir() + p.slice(1)
  return isAbsolute(p) ? resolve(p) : resolve(PROJECT_DIR, p)
}

/**
 * True when a captured path points outside this project — i.e. a sibling repo.
 *
 * The two git rules below exist because *within* this project the cwd is already
 * the project root, so `git -C` / `cd … && git` are redundant. That rationale
 * doesn't hold for a sibling checkout (e.g. cross-repo work driven by
 * /sync-workflow, which audits SahajAtlasWeb and WeMeditateWeb), so those are
 * exempt. Anything inside the project — including its own worktrees — stays blocked.
 */
function targetsSiblingRepo(match) {
  const p = resolvePath(match?.[1])
  if (!p) return false
  return p !== PROJECT_DIR && !p.startsWith(PROJECT_DIR + sep)
}

// Anchored to command-position only (start of command, after && / ; / | / ||)
// so we don't false-positive on these tokens appearing inside echo'd strings.
const CMD_START = '(?:^|&&|;|\\|\\||\\|)\\s*'

const rules = [
  {
    test: new RegExp(`${CMD_START}npm\\s+(install|i|run|test|exec|add|remove|update|ci)\\b`),
    reason:
      'This project uses pnpm. Replace `npm <verb>` with `pnpm <verb>` (e.g. `pnpm install`, `pnpm test`, `pnpm exec ...`). `npm view` and `npm why` are allowed for read-only registry queries.',
  },
  {
    test: new RegExp(`${CMD_START}git\\s+-C\\s+(\\S+)`),
    exempt: targetsSiblingRepo,
    reason:
      'Per CLAUDE.md: avoid `git -C <path>` for paths inside this project. Run git from the working directory directly (the project root is already cwd). Sibling repos outside the project are exempt.',
  },
  {
    test: new RegExp(`${CMD_START}cd\\s+(\\S+).*?&&\\s*git\\b`),
    exempt: targetsSiblingRepo,
    reason:
      'Per the Bash tool rule: never prepend `cd <path> && ...` to a `git` command for paths inside this project. `git` already operates on the current working tree, and the compound triggers a permission prompt. Run `git ...` directly. Sibling repos outside the project are exempt.',
  },
]

for (const rule of rules) {
  const match = command.match(rule.test)
  if (match && !rule.exempt?.(match)) {
    const out = {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: rule.reason,
      },
    }
    console.log(JSON.stringify(out))
    process.exit(0)
  }
}

process.exit(0)
