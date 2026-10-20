#!/usr/bin/env node

/**
 * Unit Test Hook (PostToolUse / Edit|Write)
 *
 * Runs the unit specs that name the edited file, not the whole lane. Silent when they pass or
 * when no spec names the file. Reports a failing tail as non-blocking context, and reports a
 * timeout or a vitest that never started as exactly that, never as a test failure.
 *
 * The logic lives in `scripts/unit-test-hook.mjs`, outside this protected directory, so it is
 * unit-tested and an unattended run can change it. This is Tier 1 of the three-tier speed
 * contract. See `docs/rules/testing-reqs.md`.
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
