#!/usr/bin/env node

/**
 * Environment Validation Hook (PreToolUse)
 *
 * Validates required environment variables before critical operations.
 * Blocks operations if required env vars are missing.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Read hook input from stdin
const input = JSON.parse(readFileSync(0, 'utf-8'));

// Check if this is a build or deploy command
const command = input.command || '';
const isCriticalOperation = command.includes('build') ||
                           command.includes('start') ||
                           command.includes('deploy') ||
                           command.includes('railway');

if (!isCriticalOperation) {
  // Not a critical operation, skip validation
  process.exit(0);
}

const projectDir = process.env.CLAUDE_PROJECT_DIR;
const envPath = join(projectDir, '.env');

// Required environment variables
const requiredVars = [
  'DATABASE_URI',
  'PAYLOAD_SECRET'
];

const missingVars = [];
const warnings = [];

// Check for .env file
if (!existsSync(envPath)) {
  console.log(JSON.stringify({
    continue: false,
    additionalContext: '❌ No .env file found. Please create one with required environment variables:\n\n' +
                      requiredVars.join('\n') +
                      '\n\nCopy from .env.example if available.'
  }));
  process.exit(2);
}

// Check each required variable
for (const varName of requiredVars) {
  if (!process.env[varName]) {
    missingVars.push(varName);
  }
}

// Check optional but recommended variables for production
if (command.includes('deploy') || command.includes('railway')) {
  const productionVars = ['S3_ENDPOINT', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_BUCKET'];
  const missingProdVars = productionVars.filter(v => !process.env[v]);

  if (missingProdVars.length > 0) {
    warnings.push(`⚠️  Production storage not configured: ${missingProdVars.join(', ')}`);
  }
}

if (missingVars.length > 0) {
  console.log(JSON.stringify({
    continue: false,
    additionalContext: `❌ Missing required environment variables:\n\n${missingVars.join('\n')}\n\nPlease set these in your .env file before proceeding.`
  }));
  process.exit(2);
}

if (warnings.length > 0) {
  console.log(JSON.stringify({
    continue: true,
    additionalContext: warnings.join('\n\n') + '\n\nProceeding with local storage fallback.'
  }));
}

process.exit(0);
