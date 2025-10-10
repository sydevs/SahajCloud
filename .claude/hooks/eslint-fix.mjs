#!/usr/bin/env node

/**
 * ESLint Auto-Fix Hook (PostToolUse)
 *
 * Runs ESLint with auto-fix on edited files.
 * Reports remaining issues to Claude for manual fixing.
 */

import { readFileSync } from 'fs';
import { execSync } from 'child_process';

// Read hook input from stdin
const input = JSON.parse(readFileSync(0, 'utf-8'));

// Only process JS/TS files
const isLintableFile = (file) => /\.(js|jsx|ts|tsx|mjs)$/.test(file);
const files = input.files?.filter(isLintableFile) || [];

if (files.length === 0) {
  console.log(JSON.stringify({
    continue: true,
    suppressOutput: true
  }));
  process.exit(0);
}

try {
  // Run ESLint with auto-fix
  const fileList = files.map(f => `"${f}"`).join(' ');
  execSync(`npx eslint ${fileList} --fix`, {
    cwd: process.env.CLAUDE_PROJECT_DIR,
    encoding: 'utf-8',
    stdio: 'pipe'
  });

  // No errors remaining
  console.log(JSON.stringify({
    continue: true,
    suppressOutput: true
  }));
  process.exit(0);

} catch (error) {
  const output = error.stdout || error.stderr || '';

  // Check if there are unfixable errors
  if (output.includes('error') || output.includes('problem')) {
    console.log(JSON.stringify({
      continue: true,
      additionalContext: `ESLint found issues that couldn't be auto-fixed:\n\n${output}\n\nPlease review and fix these manually.`
    }));
  } else {
    // Auto-fix succeeded, suppress output
    console.log(JSON.stringify({
      continue: true,
      suppressOutput: true
    }));
  }

  process.exit(0);
}
