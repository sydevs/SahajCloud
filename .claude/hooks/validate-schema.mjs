#!/usr/bin/env node

/**
 * Collection Schema Validation Hook (PreToolUse)
 *
 * Validates Payload collection schema changes before saving.
 * Checks for common issues like missing slugs, invalid field types, etc.
 */

import { readFileSync } from 'fs';

// Read hook input from stdin
const input = JSON.parse(readFileSync(0, 'utf-8'));

const files = input.files || [];

// Only validate collection files
const collectionFiles = files.filter(file =>
  file.includes('/collections/') && file.endsWith('.ts')
);

if (collectionFiles.length === 0) {
  process.exit(0);
}

const errors = [];
const warnings = [];

// Read and validate each collection file
for (const file of collectionFiles) {
  try {
    const content = readFileSync(file, 'utf-8');

    // Check for required imports
    if (content.includes('export const') && !content.includes('import type { CollectionConfig }')) {
      warnings.push(`${file}: Missing CollectionConfig import`);
    }

    // Check for slug field best practices
    if (content.includes('slug:') && !content.includes('required: true')) {
      warnings.push(`${file}: Slug field should be required`);
    }

    // Check for access control
    if (!content.includes('access:') && !content.includes('permissionBasedAccess')) {
      warnings.push(`${file}: Collection missing access control configuration`);
    }

    // Check for admin configuration
    if (!content.includes('admin:')) {
      warnings.push(`${file}: Consider adding admin configuration for better UX`);
    }

    // Check for relationship integrity
    const relationshipMatches = content.match(/relationTo:\s*['"`]([^'"`]+)['"`]/g);
    if (relationshipMatches) {
      for (const match of relationshipMatches) {
        const collectionName = match.match(/['"`]([^'"`]+)['"`]/)[1];
        // Basic validation - collection names should be lowercase or camelCase
        if (!/^[a-z][a-zA-Z0-9-]*$/.test(collectionName)) {
          errors.push(`${file}: Invalid collection name in relationship: ${collectionName}`);
        }
      }
    }

  } catch (error) {
    errors.push(`${file}: Failed to read file - ${error.message}`);
  }
}

if (errors.length > 0) {
  console.log(JSON.stringify({
    continue: false,
    additionalContext: `❌ Collection schema validation errors:\n\n${errors.join('\n')}\n\nPlease fix these issues before saving.`
  }));
  process.exit(2);
}

if (warnings.length > 0) {
  console.log(JSON.stringify({
    continue: true,
    additionalContext: `⚠️  Collection schema warnings:\n\n${warnings.join('\n')}\n\nConsider addressing these for better code quality.`
  }));
}

process.exit(0);
