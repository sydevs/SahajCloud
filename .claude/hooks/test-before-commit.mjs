#!/usr/bin/env node

/**
 * Integration Tests Hook (PreToolUse - Bash)
 *
 * Runs integration tests before git commit operations.
 * Blocks commits if tests fail.
 */

import { readFileSync } from 'fs';
import { execSync } from 'child_process';

// Read hook input from stdin
const input = JSON.parse(readFileSync(0, 'utf-8'));

// Only trigger on git commit commands
const command = input.command || '';
if (!command.includes('git commit')) {
  process.exit(0);
}

console.error('🧪 Running integration tests before commit...');

try {
  // Run integration tests
  execSync('pnpm test:int', {
    cwd: process.env.CLAUDE_PROJECT_DIR,
    encoding: 'utf-8',
    stdio: 'inherit'
  });

  console.error('✅ All tests passed!');
  process.exit(0);

} catch (error) {
  console.log(JSON.stringify({
    continue: false,
    additionalContext: '❌ Integration tests failed. Please fix failing tests before committing.'
  }));
  process.exit(2); // Block commit
}
