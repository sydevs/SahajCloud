#!/usr/bin/env node

/**
 * Smart Test Runner Hook (PostToolUse)
 *
 * Runs relevant tests after file changes.
 * Maps source files to their corresponding test files.
 */

import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join, dirname, basename } from 'path';

// Read hook input from stdin
const input = JSON.parse(readFileSync(0, 'utf-8'));

const files = input.files || [];
if (files.length === 0) {
  console.log(JSON.stringify({ continue: true, suppressOutput: true }));
  process.exit(0);
}

const projectDir = process.env.CLAUDE_PROJECT_DIR;

// Find corresponding test files
const testFiles = new Set();

for (const file of files) {
  // Skip test files themselves
  if (file.includes('/tests/') || file.endsWith('.spec.ts') || file.endsWith('.test.ts')) {
    continue;
  }

  // For collection files, run integration tests
  if (file.includes('/collections/')) {
    const collectionName = basename(file, '.ts');
    const intTestPath = join(projectDir, `tests/int/${collectionName.toLowerCase()}.int.spec.ts`);
    if (existsSync(intTestPath)) {
      testFiles.add(intTestPath);
    }
  }

  // For component files, check for corresponding test files
  if (file.includes('/components/')) {
    const componentPath = file.replace(projectDir + '/', '');
    const testPath = componentPath.replace('/components/', '/tests/').replace('.tsx', '.spec.tsx').replace('.ts', '.spec.ts');
    const fullTestPath = join(projectDir, testPath);
    if (existsSync(fullTestPath)) {
      testFiles.add(fullTestPath);
    }
  }
}

if (testFiles.size === 0) {
  console.log(JSON.stringify({ continue: true, suppressOutput: true }));
  process.exit(0);
}

try {
  const testList = Array.from(testFiles).join(' ');
  console.error(`🧪 Running ${testFiles.size} relevant test file(s)...`);

  execSync(`pnpm test:int -- ${testList} --no-coverage --run`, {
    cwd: projectDir,
    encoding: 'utf-8',
    stdio: 'inherit'
  });

  console.log(JSON.stringify({
    continue: true,
    suppressOutput: true
  }));
  process.exit(0);

} catch (error) {
  console.log(JSON.stringify({
    continue: true,
    additionalContext: `Some tests failed after your changes. Please review and fix the failing tests.`
  }));
  process.exit(0);
}
