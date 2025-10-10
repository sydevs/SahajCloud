#!/usr/bin/env node

/**
 * TypeScript Validation Hook (PreToolUse)
 *
 * Blocks file edits that would introduce TypeScript errors.
 * Runs before Write/Edit operations on TypeScript files.
 */

import { readFileSync } from 'fs';
import { execSync } from 'child_process';

// Read hook input from stdin
const input = JSON.parse(readFileSync(0, 'utf-8'));

// Only process TypeScript/TSX files
const isTypeScriptFile = (file) => /\.(ts|tsx)$/.test(file);
const files = input.files?.filter(isTypeScriptFile) || [];

if (files.length === 0) {
  // No TypeScript files, allow operation
  process.exit(0);
}

try {
  // Run TypeScript compiler to check for errors
  execSync('npx tsc --noEmit --pretty false', {
    cwd: process.env.CLAUDE_PROJECT_DIR,
    encoding: 'utf-8',
    stdio: 'pipe'
  });

  // No errors, allow operation
  process.exit(0);

} catch (error) {
  // Type errors detected
  const output = error.stdout || error.stderr || '';
  const errorCount = output.split('\n').filter(line => /error TS\d+:/.test(line)).length;

  if (errorCount > 0) {
    console.log(JSON.stringify({
      continue: false,
      additionalContext: `❌ Cannot proceed: TypeScript has ${errorCount} type error(s). Please fix these errors before making changes:\n\n${output}`
    }));
    process.exit(2); // Block operation
  }

  process.exit(0);
}
