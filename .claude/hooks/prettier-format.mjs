#!/usr/bin/env node

/**
 * Prettier Auto-Format Hook (PostToolUse)
 *
 * Automatically formats files with Prettier after edits.
 * Silently formats and only reports if issues occur.
 */

import { readFileSync } from 'fs';
import { execSync } from 'child_process';

// Read hook input from stdin
const input = JSON.parse(readFileSync(0, 'utf-8'));

// Get list of files to format
const files = input.files || [];

if (files.length === 0) {
  console.log(JSON.stringify({
    continue: true,
    suppressOutput: true
  }));
  process.exit(0);
}

// Filter files that Prettier can format
const formattableExtensions = ['.js', '.jsx', '.ts', '.tsx', '.json', '.css', '.md', '.mjs'];
const formattableFiles = files.filter(file =>
  formattableExtensions.some(ext => file.endsWith(ext))
);

if (formattableFiles.length === 0) {
  console.log(JSON.stringify({
    continue: true,
    suppressOutput: true
  }));
  process.exit(0);
}

try {
  // Format each file
  for (const file of formattableFiles) {
    try {
      execSync(`npx prettier --write "${file}"`, {
        cwd: process.env.CLAUDE_PROJECT_DIR,
        encoding: 'utf-8',
        stdio: 'pipe'
      });
    } catch (err) {
      // Ignore individual file errors
    }
  }

  // Success - suppress output to avoid noise
  console.log(JSON.stringify({
    continue: true,
    suppressOutput: true
  }));
  process.exit(0);

} catch (error) {
  // Only report if there's a critical error
  console.log(JSON.stringify({
    continue: true,
    additionalContext: `Prettier formatting encountered issues: ${error.message}`
  }));
  process.exit(0);
}
