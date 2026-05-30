#!/usr/bin/env node

/**
 * ESLint Auto-Fix Hook (PostToolUse / Edit|Write)
 *
 * Runs eslint --fix on the single edited file. Reports only when issues
 * remain or were auto-fixed.
 */

import { execSync } from 'child_process'
import { readFileSync } from 'fs'

const input = JSON.parse(readFileSync(0, 'utf-8'))
const filePath = input?.tool_input?.file_path ?? ''

if (!filePath || !/\.(js|jsx|ts|tsx|mjs)$/.test(filePath)) {
  console.log(JSON.stringify({ continue: true, suppressOutput: true }))
  process.exit(0)
}

const projectDir = process.env.CLAUDE_PROJECT_DIR

const runEslint = (extraArgs = '') => {
  try {
    const result = execSync(`npx eslint --format json ${extraArgs} "${filePath}"`, {
      cwd: projectDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    })
    return result || '[]'
  } catch (error) {
    return error.stdout || '[]'
  }
}

try {
  const beforeIssues = JSON.parse(runEslint())
  runEslint('--fix')
  const afterIssues = JSON.parse(runEslint())

  const beforeCount = beforeIssues.reduce((sum, f) => sum + f.errorCount + f.warningCount, 0)
  const afterCount = afterIssues.reduce((sum, f) => sum + f.errorCount + f.warningCount, 0)
  const fixed = beforeCount - afterCount

  if (afterCount > 0) {
    const messages = afterIssues
      .flatMap((f) =>
        f.messages.map((m) => `  ${m.line}:${m.column} ${m.message} (${m.ruleId ?? 'unknown'})`),
      )
      .slice(0, 10)
      .join('\n')
    const prefix = fixed > 0 ? `ESLint auto-fixed ${fixed} issue(s); ` : ''
    console.log(
      JSON.stringify({
        continue: true,
        additionalContext: `${prefix}${afterCount} issue(s) remain in ${filePath.replace(projectDir + '/', '')}:\n${messages}`,
      }),
    )
  } else if (fixed > 0) {
    console.log(
      JSON.stringify({
        continue: true,
        additionalContext: `ESLint auto-fixed ${fixed} issue(s) in ${filePath.replace(projectDir + '/', '')}.`,
      }),
    )
  } else {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }))
  }
  process.exit(0)
} catch (error) {
  console.log(JSON.stringify({ continue: true, suppressOutput: true }))
  process.exit(0)
}
