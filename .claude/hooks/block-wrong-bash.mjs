#!/usr/bin/env node

/**
 * Block Wrong Bash Commands Hook (PreToolUse / Bash)
 *
 * Denies common wrong invocations and tells Claude the right one instead.
 * Saves tokens by failing fast rather than letting Claude try, fail, retry.
 */

import { readFileSync } from 'fs'

const input = JSON.parse(readFileSync(0, 'utf-8'))
const command = input?.tool_input?.command ?? ''

if (!command) {
  process.exit(0)
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
    test: new RegExp(`${CMD_START}git\\s+-C\\b`),
    reason:
      'Per CLAUDE.md: avoid `git -C <path>`. Run git from the working directory directly (the project root is already cwd).',
  },
  {
    test: new RegExp(`${CMD_START}cd\\s+\\S.*?&&\\s*git\\b`),
    reason:
      'Per the Bash tool rule: never prepend `cd <project> && ...` to a `git` command. `git` already operates on the current working tree, and the compound triggers a permission prompt. Run `git ...` directly.',
  },
]

for (const rule of rules) {
  if (rule.test.test(command)) {
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
