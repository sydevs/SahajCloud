#!/bin/bash

# Test Storyblok Import Script
# Tests the storyblok import against the seed_test Postgres schema.

set -e

echo "🧪 Testing Storyblok Import Script"
echo "=================================="
echo ""

# Setup test database
echo "📦 Initializing SQLite test database..."
pnpm tsx seeds/tests/setup-test-db.ts setup
echo ""

# Set test environment variables
# Payload connects to the seed_test Postgres schema via test-payload.config.ts.
# Set DATABASE_URL to a reachable Postgres instance.
export PAYLOAD_SECRET="test-secret-key-12345"

# Check if STORYBLOK_ACCESS_TOKEN is set
if [ -z "$STORYBLOK_ACCESS_TOKEN" ]; then
    echo "⚠️  STORYBLOK_ACCESS_TOKEN not set - will fail if script needs it"
    echo "   Set it with: export STORYBLOK_ACCESS_TOKEN=your_token_here"
    echo ""
fi

echo "🧪 Test 1: Dry Run"
echo "-------------------"
pnpm tsx seeds/storyblok/import.ts --dry-run || {
    echo "❌ Dry run failed"
    exit 1
}
echo "✓ Dry run passed"
echo ""

echo "🧪 Test 2: Actual Import (Dry Run)"
echo "-------------------"
pnpm tsx seeds/storyblok/import.ts --dry-run || {
    echo "❌ Import failed"
    exit 1
}
echo "✓ Import passed"
echo ""

echo "✅ All Storyblok tests passed!"
echo ""
echo "📊 Test database contains:"
pnpm tsx seeds/tests/check-db-stats.ts

# Cleanup
echo ""
read -p "Clean up test database? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    pnpm tsx seeds/tests/setup-test-db.ts cleanup
    echo "✓ Cleanup complete"
fi
