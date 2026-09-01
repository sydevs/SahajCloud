#!/usr/bin/env node

/**
 * Unit Test Hook (PostToolUse / Edit|Write)
 *
 * Runs the unit lane (`pnpm test:unit`) when source files or unit specs
 * change, giving Claude sub-5-second feedback during editing. Silent on
 * success; reports a short failure tail when tests break.
 *
 * Triggers on edits to:
 *   - src/{file}.ts / .tsx           (excluding src/payload-types.ts, src/migrations/**)
 *   - tests/unit/{file}.spec.ts      (the unit specs themselves)
 *
 * Tier 1 of the three-tier speed contract — see `docs/rules/testing-reqs.md`.
 */

import { execSync } from 'child_process'
import { readFileSync } from 'fs'

const input = JSON.parse(readFileSync(0, 'utf-8'))
const filePath = input?.tool_input?.file_path ?? ''

const projectDir = process.env.CLAUDE_PROJECT_DIR || ''
const rel = filePath.startsWith(projectDir + '/') ? filePath.slice(projectDir.length + 1) : filePath

const isSrc = /^src\/.*\.(ts|tsx)$/.test(rel)
const isUnitSpec = /^tests\/unit\/.*\.spec\.ts$/.test(rel)
const isExcluded = rel === 'src/payload-types.ts' || /^src\/migrations\//.test(rel)

if ((!isSrc && !isUnitSpec) || isExcluded) {
  console.log(JSON.stringify({ continue: true, suppressOutput: true }))
  process.exit(0)
}

try {
  execSync('pnpm test:unit', {
    cwd: projectDir,
    encoding: 'utf-8',
    stdio: 'pipe',
    timeout: 30000,
  })
  console.log(JSON.stringify({ continue: true, suppressOutput: true }))
  process.exit(0)
} catch (error) {
  const output = (error.stdout || error.stderr || error.message || '')
    .toString()
    .split('\n')
    .slice(-30)
    .join('\n')
  console.log(
    JSON.stringify({
      continue: true,
      additionalContext: `Unit tests failed after editing ${rel}:\n\n${output}\n\nRun \`pnpm test:unit\` to see the full output.`,
    }),
  )
  process.exit(0)
}
