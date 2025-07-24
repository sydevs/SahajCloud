import { BaseImporter } from '../BaseImporter'
import { transformSlug, transformNumber } from '../validation'
import path from 'path'

export class MusicImporter extends BaseImporter {
  constructor() {
    super({
      collection: 'music',
      validationRules: [
        {
          field: 'title',
          required: true,
          type: 'string',
          minLength: 1,
          maxLength: 200
        },
        {
          field: 'audioFilePath',
          required: true,
          type: 'string',
          custom: (value) => {
            if (!value) return 'Audio file path is required'
            
            // Check file extension (file existence check would need to be async, so we skip it here)
            const ext = path.extname(value).toLowerCase()
            if (!['.mp3', '.wav', '.m4a', '.aac'].includes(ext)) {
              return 'Audio file must be MP3, WAV, M4A, or AAC format'
            }
            
            return null
          }
        },
        {
          field: 'duration',
          required: false,
          type: 'number',
          min: 0
        },
        {
          field: 'genre',
          required: false,
          type: 'string',
          maxLength: 100
        },
        {
          field: 'tags',
          required: false,
          custom: (value) => {
            if (value && typeof value === 'string') {
              // Tags should be comma-separated
              return null
            }
            if (value && !Array.isArray(value)) {
              return 'Tags must be an array or comma-separated string'
            }
            return null
          }
        }
      ],
      transform: (data) => {
        const transformed: any = {
          title: data.title,
          slug: data.slug || transformSlug(data.title),
          genre: data.genre,
          audioFile: data.audioFilePath, // Will be handled in beforeImport
        }

        // Handle duration
        if (data.duration !== undefined) {
          transformed.duration = transformNumber(data.duration)
        }

        // Handle tags (convert comma-separated string to array)
        if (data.tags) {
          if (typeof data.tags === 'string') {
            transformed.tags = data.tags.split(',').map((tag: string) => tag.trim())
          } else if (Array.isArray(data.tags)) {
            transformed.tags = data.tags
          }
        }

        return transformed
      },
      beforeImport: async (data) => {
        // For now, we'll store the file path and handle actual upload later
        // In a real implementation, you would upload the file to storage here
        console.log(`Would upload audio file: ${data.audioFile}`)
        
        // Remove audioFile field as it's not a direct field in the collection
        // In production, you would get the uploaded file ID here
        delete data.audioFile
        
        // If tags are provided, we need to find or create tag IDs
        if (data.tags && Array.isArray(data.tags)) {
          // This would need to be implemented to find/create tags
          console.log(`Would find/create tags: ${data.tags.join(', ')}`)
          delete data.tags // Remove for now as it needs tag IDs
        }

        return data
      }
    })
  }
}

// CLI usage example
if (require.main === module) {
  (async () => {
    const importer = new MusicImporter()
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