#!/usr/bin/env node

/**
 * Unit Test Hook (PostToolUse / Edit|Write) — Tier 1 of `docs/rules/testing-reqs.md`.
 *
 * Kept thin on purpose: the logic, and why it lives outside `.claude/`, is in
 * `scripts/unit-test-hook.mjs`.
 */

import { readFileSync } from 'fs'

import { runHook } from '../../scripts/unit-test-hook.mjs'

let input = null
try {
  input = JSON.parse(readFileSync(0, 'utf-8'))
} catch {
  // Not a tool call this hook can read. Nothing to run.
}

let message = null
try {
  message = runHook({
    filePath: input?.tool_input?.file_path,
    projectDir: process.env.CLAUDE_PROJECT_DIR || undefined,
  })
} catch (error) {
  message = `The unit-test hook itself errored, so no specs ran. This is not a test result: ${error?.message ?? error}`
}

console.log(
  JSON.stringify(
    message
      ? { continue: true, additionalContext: message }
      : { continue: true, suppressOutput: true },
  ),
)
