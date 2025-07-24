import { BaseImporter } from '../BaseImporter'
import { transformSlug } from '../validation'

export class NarratorsImporter extends BaseImporter {
  constructor() {
    super({
      collection: 'narrators',
      validationRules: [
        {
          field: 'name',
          required: true,
          type: 'string',
          minLength: 1,
          maxLength: 100
        },
        {
          field: 'gender',
          required: true,
          type: 'string',
          custom: (value) => {
            if (!['male', 'female'].includes(value)) {
              return 'Gender must be either "male" or "female"'
            }
            return null
          }
        },
        {
          field: 'slug',
          required: false,
          type: 'string',
          pattern: /^[a-z0-9-]+$/
        }
      ],
      transform: (data) => {
        return {
          ...data,
          // Generate slug from name if not provided
          slug: data.slug || transformSlug(data.name),
          // Ensure gender is lowercase
          gender: data.gender.toLowerCase()
        }
      }
    })
  }
}

// CLI usage example
if (require.main === module) {
  (async () => {
    const importer = new NarratorsImporter()
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