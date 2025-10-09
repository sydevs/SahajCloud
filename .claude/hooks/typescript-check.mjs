#!/usr/bin/env node

/**
 * TypeScript Type Checking Hook (PostToolUse)
 *
 * Runs TypeScript compiler to check for type errors after file edits.
 * Provides detailed error messages to Claude for automatic fixing.
 */

import { readFileSync } from 'fs';
import { execSync } from 'child_process';

// Read hook input from stdin
const input = JSON.parse(readFileSync(0, 'utf-8'));

// Only process TypeScript/TSX files
const isTypeScriptFile = (file) => /\.(ts|tsx)$/.test(file);
const files = input.files?.filter(isTypeScriptFile) || [];

if (files.length === 0) {
  // No TypeScript files changed, skip silently
  console.log(JSON.stringify({
    continue: true,
    suppressOutput: true
  }));
  process.exit(0);
}

try {
  // Run TypeScript compiler with no emit (type checking only)
  execSync('npx tsc --noEmit --pretty false', {
    cwd: process.env.CLAUDE_PROJECT_DIR,
    encoding: 'utf-8',
    stdio: 'pipe'
  });

  // No errors found
  console.log(JSON.stringify({
    continue: true,
    suppressOutput: true
  }));
  process.exit(0);

} catch (error) {
  // Type errors found
  const output = error.stdout || error.stderr || '';
  const errorLines = output.split('\n').filter(line => line.trim());

  // Count errors
  const errorCount = errorLines.filter(line => /error TS\d+:/.test(line)).length;

  if (errorCount > 0) {
    console.log(JSON.stringify({
      continue: true,
      additionalContext: `TypeScript found ${errorCount} type error(s) in the edited files:\n\n${output}\n\nPlease review and fix these type errors.`
    }));
  } else {
    // No type errors in changed files, suppress output
    console.log(JSON.stringify({
      continue: true,
      suppressOutput: true
    }));
  }

  process.exit(0);
}
