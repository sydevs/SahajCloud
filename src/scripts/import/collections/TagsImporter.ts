import { BaseImporter } from '../BaseImporter'
import { transformSlug } from '../validation'

export class TagsImporter extends BaseImporter {
  constructor() {
    super({
      collection: 'tags',
      validationRules: [
        {
          field: 'title',
          required: true,
          type: 'string',
          minLength: 1,
          maxLength: 100
        },
        {
          field: 'slug',
          required: false,
          type: 'string',
          pattern: /^[a-z0-9-]+$/,
          custom: (value, data) => {
            // If slug is provided, validate it
            if (value && !/^[a-z0-9-]+$/.test(value)) {
              return 'Slug must contain only lowercase letters, numbers, and hyphens'
            }
            return null
          }
        }
      ],
      transform: (data) => {
        return {
          ...data,
          // Generate slug from title if not provided
          slug: data.slug || transformSlug(data.title)
        }
      }
    })
  }
}

// CLI usage example
if (require.main === module) {
  (async () => {
    const importer = new TagsImporter()
    await importer.initialize()

    const filePath = process.argv[2]
    if (!filePath) {
      console.error('Please provide a file path to import')
      process.exit(1)
    }

    const options = {
      dryRun: process.argv.includes('--dry-run'),
      validateOnly: process.argv.includes('--validate-only'),
      onProgress: (current: number, total: number) => {
        console.log(`Progress: ${current}/${total}`)
      }
    }

    const result = filePath.endsWith('.json') 
      ? await importer.importFromJSON(filePath, options)
      : await importer.importFromCSV(filePath, options)

    const report = await importer.generateImportReport(result)
    console.log(report)

    process.exit(result.success ? 0 : 1)
  })()
}