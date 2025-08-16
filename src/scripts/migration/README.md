# PostgreSQL to Payload CMS Migration Tool

This tool migrates data from a PostgreSQL database to Payload CMS, handling collections, relationships, media files, and data transformations.

## Features

- **Schema Analysis**: Automatically analyzes PostgreSQL database schema
- **Interactive Mapping**: Proposes field mappings with interactive confirmation
- **Media Transfer**: Downloads and re-uploads media files to Payload's storage
- **Tag Transformation**: Converts comma-separated tags to individual documents
- **Relationship Handling**: Maintains foreign key relationships as Payload references
- **Progress Tracking**: Real-time progress indicators and detailed reporting
- **Dry Run Mode**: Preview migration without writing data
- **Error Recovery**: Continues migration on errors with detailed error reporting

## Prerequisites

- Node.js 18+
- PostgreSQL database with source data
- MongoDB database for Payload CMS
- Network access to media files (if applicable)

## Installation

Install required dependencies:

```bash
pnpm add pg commander ora chalk cli-table3
```

## Configuration

### Environment Variables

Create a `.env` file with the following variables:

```env
# PostgreSQL Source Database
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=old_cms
PG_USER=postgres
PG_PASSWORD=your_password

# Media Source
MEDIA_BASE_URL=https://old-site.com/uploads

# Migration Options
MIGRATION_BATCH_SIZE=100

# Payload CMS (should already be configured)
DATABASE_URI=mongodb://localhost:27017/payload
PAYLOAD_SECRET=your-secret-key
```

## Usage

### Basic Migration

Run the migration with interactive mapping configuration:

```bash
pnpm tsx src/scripts/migration/index.ts
```

### Dry Run

Preview the migration without writing data:

```bash
pnpm tsx src/scripts/migration/index.ts --dry-run
```

### Schema Analysis Only

Analyze database schema without migrating:

```bash
pnpm tsx src/scripts/migration/index.ts --analyze-only
```

### Save Mapping Configuration

Generate and save mappings for later use:

```bash
pnpm tsx src/scripts/migration/index.ts --analyze-only --save-mappings ./migration-config.json
```

### Use Saved Configuration

Run migration with previously saved mappings:

```bash
pnpm tsx src/scripts/migration/index.ts --config ./migration-config.json
```

### Migrate Specific Tables

Migrate only specific tables:

```bash
pnpm tsx src/scripts/migration/index.ts --tables tags music
```

## Migration Process

### 1. Connection Phase
- Connects to PostgreSQL database
- Initializes Payload CMS (unless dry run)
- Sets up media transfer utility

### 2. Schema Analysis
- Queries information_schema for table structure
- Identifies columns, data types, and relationships
- Detects primary and foreign keys

### 3. Mapping Configuration
- Proposes automatic field mappings based on names
- Allows interactive confirmation/editing
- Handles special transformations (e.g., comma-separated tags)

### 4. Migration Execution

#### Order of Operations:
1. **Tags** - Migrated first as they're referenced by other collections
   - Parses comma-separated values from all tables
   - Creates unique tag documents with localized titles
   
2. **Music** - Migrates audio tracks with metadata
   - Transfers audio files
   - Auto-generates slugs from titles
   - Maps tag relationships
   
3. **Frames** - Migrates meditation poses/frames
   - Transfers image/video files
   - Determines gender (imageSet) from data
   - Maps tag relationships
   
4. **Meditations** - Migrates meditation content
   - Creates/maps narrator relationships
   - Transfers audio and thumbnail files
   - Builds frame relationships with timestamps
   - Maps all tag relationships

### 5. Reporting
- Outputs detailed migration summary
- Shows success/failure counts per collection
- Lists media transfer statistics
- Displays first few errors for debugging

## Data Transformations

### Tags
- Comma-separated strings → Individual tag documents
- Automatic deduplication
- Localized titles (en/it)

### Media Files
- Downloads from source URL
- Re-uploads to Payload storage
- Automatic format conversion (JPG→WEBP for images)
- Metadata extraction (dimensions, duration)

### Relationships
- Foreign keys → Payload relationship fields
- Legacy IDs preserved for reference
- Automatic ID mapping between old and new records

### Meditation-Frame Relationships
- Join table records → Embedded frame array
- Timestamps preserved and validated
- Automatic sorting by timestamp

## Output Example

```
===========================================
        MIGRATION SUMMARY REPORT
===========================================
Migration Date: 2024-01-15 10:30:00
Source: PostgreSQL (configured database)

┌────────────┬───────┬──────────┬────────┬─────────────┐
│ Collection │ Total │ Success  │ Failed │ Media Files │
├────────────┼───────┼──────────┼────────┼─────────────┤
│ TAGS       │ 150   │ 148 (99%)│ 2      │ -           │
│ MUSIC      │ 75    │ 75 (100%)│ 0      │ 75          │
│ FRAMES     │ 234   │ 234 (100%)│ 0     │ 234         │
│ MEDITATIONS│ 89    │ 89 (100%)│ 0      │ 89          │
├────────────┼───────┼──────────┼────────┼─────────────┤
│ TOTAL      │ 548   │ 546      │ 2      │ 398         │
└────────────┴───────┴──────────┴────────┴─────────────┘

===========================================
Total duration: 15 minutes 32 seconds
Media files transferred: 398 (8.0 GB total)
===========================================

✓ Migration completed successfully!
```

## Error Handling

The migration continues on non-critical errors and reports them at the end:

- **Validation Errors**: Data that doesn't meet Payload schema requirements
- **Media Transfer Failures**: Files that couldn't be downloaded/uploaded
- **Relationship Mapping**: Foreign keys that couldn't be resolved
- **Duplicate Data**: Records that violate uniqueness constraints

## Advanced Options

### Custom Transformations

Edit the migrator classes to add custom transformations:

```typescript
// In src/scripts/migration/migrators/MusicMigrator.ts
async transformRow(row: any): Promise<any> {
  const transformed = await super.transformRow(row)
  
  // Add custom transformation
  transformed.customField = myCustomTransform(row.old_field)
  
  return transformed
}
```

### Batch Size Configuration

Adjust batch size for memory optimization:

```env
MIGRATION_BATCH_SIZE=50  # Smaller batches for limited memory
```

## Troubleshooting

### Common Issues

1. **Connection Refused**
   - Check PostgreSQL is running and credentials are correct
   - Verify network access to database server

2. **Media Transfer Failures**
   - Ensure MEDIA_BASE_URL is correct
   - Check network access to media server
   - Verify file permissions

3. **Memory Issues**
   - Reduce MIGRATION_BATCH_SIZE
   - Run collections separately using --tables option

4. **Validation Errors**
   - Review Payload collection schemas
   - Check required fields and data types
   - Ensure relationships exist before referencing

## Cleanup

After successful migration:

1. Verify data in Payload Admin panel
2. Test media file access
3. Validate relationships and references
4. Archive or remove migration scripts (optional)
5. Remove legacy ID fields from collections (optional)

## Development

### Running Tests

```bash
pnpm test tests/int/migration
```

### Adding New Collections

1. Create a new migrator in `src/scripts/migration/migrators/`
2. Extend `BaseMigrator` class
3. Implement `transformRow()` method
4. Add to migration order in `index.ts`

## Support

For issues or questions, please refer to the main project documentation or create an issue in the repository.