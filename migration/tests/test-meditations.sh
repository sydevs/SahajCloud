#!/bin/bash

# Test Meditations Import Script
# This script tests the meditations import with a test database

set -e

echo "🧪 Testing Meditations Import Script"
echo "====================================="
echo ""

# Setup test database
echo "📦 Setting up test database..."
pnpm tsx migration/tests/setup-test-db.ts setup
echo ""

# Set test environment variables
export DATABASE_URI="mongodb://localhost:27017/sy_devs_cms_migration_test"
export PAYLOAD_SECRET="test-secret-key-12345"
export STORAGE_BASE_URL="https://storage.googleapis.com/test-bucket"

# Check if data.bin exists
if [ ! -f "migration/meditations/data.bin" ]; then
    echo "⚠️  data.bin not found at migration/meditations/data.bin"
    echo "   This script requires a PostgreSQL dump file to test"
    echo "   Skipping tests that require data.bin"
    echo ""
    HAS_DATA_BIN=false
else
    echo "✓ Found data.bin"
    HAS_DATA_BIN=true
    echo ""
fi

echo "🧪 Test 1: Dry Run"
echo "-------------------"
if [ "$HAS_DATA_BIN" = true ]; then
    pnpm tsx migration/meditations/import.ts --dry-run || {
        echo "❌ Dry run failed"
        exit 1
    }
    echo "✓ Dry run passed"
else
    echo "⊘ Skipped (no data.bin)"
fi
echo ""

echo "🧪 Test 2: Actual Import"
echo "-------------------------"
if [ "$HAS_DATA_BIN" = true ]; then
    pnpm tsx migration/meditations/import.ts || {
        echo "❌ Import failed"
        exit 1
    }
    echo "✓ Import passed"
else
    echo "⊘ Skipped (no data.bin)"
fi
echo ""

echo "🧪 Test 3: Reset and Re-import"
echo "--------------------------------"
if [ "$HAS_DATA_BIN" = true ]; then
    pnpm tsx migration/meditations/import.ts --reset || {
        echo "❌ Reset and re-import failed"
        exit 1
    }
    echo "✓ Reset and re-import passed"
else
    echo "⊘ Skipped (no data.bin)"
fi
echo ""

if [ "$HAS_DATA_BIN" = true ]; then
    echo "✅ All meditations tests passed!"
else
    echo "⚠️  Tests skipped - data.bin required"
fi
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
