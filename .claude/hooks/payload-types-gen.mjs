#!/usr/bin/env node

/**
 * Payload Types Generation Hook (PostToolUse)
 *
 * Automatically regenerates TypeScript types when collection schemas change.
 * Runs silently and only reports errors.
 */

import { readFileSync } from 'fs';
import { execSync } from 'child_process';

// Read hook input from stdin
const input = JSON.parse(readFileSync(0, 'utf-8'));

const files = input.files || [];

// Check if any collection files or payload config were modified
const isCollectionFile = files.some(file =>
  file.includes('/collections/') ||
  file.includes('payload.config.ts') ||
  file.includes('/blocks/')
);

if (!isCollectionFile) {
  console.log(JSON.stringify({
    continue: true,
    suppressOutput: true
  }));
  process.exit(0);
}

try {
  console.error('🔄 Regenerating Payload types...');

  execSync('pnpm generate:types', {
    cwd: process.env.CLAUDE_PROJECT_DIR,
    encoding: 'utf-8',
    stdio: 'pipe'
  });

  console.error('✅ Types regenerated successfully');

  console.log(JSON.stringify({
    continue: true,
    suppressOutput: true
  }));
  process.exit(0);

} catch (error) {
  const output = error.stdout || error.stderr || error.message;

  console.log(JSON.stringify({
    continue: true,
    additionalContext: `Failed to regenerate Payload types:\n\n${output}\n\nYou may need to run "pnpm generate:types" manually.`
  }));
  process.exit(0);
}
