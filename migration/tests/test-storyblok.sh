#!/bin/bash

# Test Storyblok Import Script
# This script tests the storyblok import with a test database

set -e

echo "🧪 Testing Storyblok Import Script"
echo "=================================="
echo ""

# Setup test database
echo "📦 Setting up test database..."
pnpm tsx migration/tests/setup-test-db.ts setup
echo ""

# Set test environment variables
export DATABASE_URI="mongodb://localhost:27017/sy_devs_cms_migration_test"
export PAYLOAD_SECRET="test-secret-key-12345"

# Check if STORYBLOK_ACCESS_TOKEN is set
if [ -z "$STORYBLOK_ACCESS_TOKEN" ]; then
    echo "⚠️  STORYBLOK_ACCESS_TOKEN not set - will fail if script needs it"
    echo "   Set it with: export STORYBLOK_ACCESS_TOKEN=your_token_here"
    echo ""
fi

echo "🧪 Test 1: Dry Run"
echo "-------------------"
pnpm tsx migration/storyblok/import.ts --dry-run || {
    echo "❌ Dry run failed"
    exit 1
}
echo "✓ Dry run passed"
echo ""

echo "🧪 Test 2: Actual Import with Unit Filter"
echo "-------------------------------------------"
pnpm tsx migration/storyblok/import.ts --unit=1 || {
    echo "❌ Import failed"
    exit 1
}
echo "✓ Import passed"
echo ""

echo "🧪 Test 3: Resume Import"
echo "-------------------------"
pnpm tsx migration/storyblok/import.ts --resume || {
    echo "❌ Resume failed"
    exit 1
}
echo "✓ Resume passed"
echo ""

echo "🧪 Test 4: Reset and Re-import"
echo "--------------------------------"
pnpm tsx migration/storyblok/import.ts --reset --unit=1 || {
    echo "❌ Reset and re-import failed"
    exit 1
}
echo "✓ Reset and re-import passed"
echo ""

echo "✅ All Storyblok tests passed!"
echo ""
echo "📊 Test database contains:"
pnpm tsx migration/tests/check-db-stats.ts

# Cleanup
echo ""
read -p "Clean up test database? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    pnpm tsx migration/tests/setup-test-db.ts cleanup
    echo "✓ Cleanup complete"
fi
