# Content Import Scripts

This directory contains scripts for importing content into Payload CMS collections.

## Usage

### Basic Import

```bash
# Import tags from CSV
pnpm tsx src/scripts/import/import.ts tags ./data/tags.csv

# Import narrators from JSON
pnpm tsx src/scripts/import/import.ts narrators ./data/narrators.json
```

### Options

- `--dry-run` or `-d`: Perform a dry run without actually importing data
- `--validate-only` or `-v`: Only validate data without importing
- `--batch-size <size>` or `-b <size>`: Number of records to process at once (default: 100)
- `--report <path>` or `-r <path>`: Path to save import report

### Examples

```bash
# Dry run to test import
pnpm tsx src/scripts/import/import.ts tags ./examples/tags.csv --dry-run

# Validate data only
pnpm tsx src/scripts/import/import.ts narrators ./examples/narrators.json --validate-only

# Import with custom batch size and save report
pnpm tsx src/scripts/import/import.ts music ./data/music.csv --batch-size 50 --report ./import-report.txt
```

## File Formats

### CSV Format

- First row must contain column headers
- Column names must match the field names expected by the importer
- Use quotes for values containing commas

Example:
```csv
title,slug
Mindfulness,mindfulness
"Stress Relief",stress-relief
```

### JSON Format

- Must be an array of objects
- Each object represents one record to import

Example:
```json
[
  {
    "name": "John Smith",
    "gender": "male",
    "slug": "john-smith"
  }
]
```

## Available Collections

- `tags`: Import meditation tags
- `narrators`: Import narrator profiles
- `music`: Import music tracks (requires audio file paths)

## Validation Rules

Each collection has specific validation rules:

### Tags
- `title`: Required, string (1-100 characters)
- `slug`: Optional, lowercase letters/numbers/hyphens only

### Narrators
- `name`: Required, string (1-100 characters)
- `gender`: Required, must be "male" or "female"
- `slug`: Optional, lowercase letters/numbers/hyphens only

### Music
- `title`: Required, string (1-200 characters)
- `audioFilePath`: Required, path to audio file (MP3, WAV, M4A, or AAC)
- `duration`: Optional, number (seconds)
- `genre`: Optional, string (max 100 characters)
- `tags`: Optional, comma-separated string or array

## Creating Custom Importers

To create an importer for a new collection:

1. Create a new file in `collections/` directory
2. Extend the `BaseImporter` class
3. Define validation rules and transformations
4. Add the importer to the `IMPORTERS` object in `import.ts`

See existing importers for examples.