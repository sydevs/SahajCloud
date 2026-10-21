#!/usr/bin/env node

/**
 * Payload Types Generation Hook (PostToolUse / Edit|Write)
 *
 * Kept thin on purpose: which edits regenerate types, and how a timeout is told apart from a
 * failed generation, is in `scripts/payload-types-hook.mjs`.
 */

import { readFileSync } from 'fs'

import { runTypesHook } from '../../scripts/payload-types-hook.mjs'

let input = null
try {
  input = JSON.parse(readFileSync(0, 'utf-8'))
} catch {
  // Not a tool call this hook can read. Nothing to run.
}

let message = null
try {
  message = runTypesHook({
    filePath: input?.tool_input?.file_path,
    projectDir: process.env.CLAUDE_PROJECT_DIR || undefined,
  })
} catch (error) {
  message = `The Payload types hook itself errored, so types were not regenerated: ${error?.message ?? error}`
}

console.log(
  JSON.stringify(
    message
      ? { continue: true, additionalContext: message }
      : { continue: true, suppressOutput: true },
  ),
)
