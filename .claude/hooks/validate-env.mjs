#!/usr/bin/env node

/**
 * Environment Validation Hook (PreToolUse)
 *
 * Validates required environment variables before critical operations.
 * Updated for Wrangler/D1 project configuration (no DATABASE_URI needed).
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
                           command.includes('wrangler deploy');

if (!isCriticalOperation) {
  // Not a critical operation, skip validation
  process.exit(0);
}

const projectDir = process.env.CLAUDE_PROJECT_DIR;
const envPath = join(projectDir, '.env');

// Required environment variables for this Wrangler/D1 project
const requiredVars = [
  'PAYLOAD_SECRET'  // DATABASE_URI not needed (uses Wrangler)
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
if (command.includes('deploy') || command.includes('wrangler')) {
  // S3/R2 storage for production
  const productionVars = ['S3_ENDPOINT', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_BUCKET'];
  const missingProdVars = productionVars.filter(v => !process.env[v]);

  if (missingProdVars.length > 0) {
    warnings.push(`⚠️  Production storage not configured: ${missingProdVars.join(', ')}`);
  }

  // Email for production
  if (!process.env.RESEND_API_KEY) {
    warnings.push(`⚠️  Production email not configured: RESEND_API_KEY`);
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
    additionalContext: warnings.join('\n\n') + '\n\nProceeding with development configuration (local storage, Ethereal email).'
  }));
}

process.exit(0);
