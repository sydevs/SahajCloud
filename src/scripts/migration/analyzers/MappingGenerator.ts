import type { TableSchema, FieldMapping, CollectionMappings } from '../types'
import * as readline from 'readline/promises'
import { stdin as input, stdout as output } from 'process'
import chalk from 'chalk'

export class MappingGenerator {
  private rl: readline.Interface

  constructor() {
    this.rl = readline.createInterface({ input, output })
  }

  async generateMappings(schemas: TableSchema[]): Promise<CollectionMappings> {
    const mappings: CollectionMappings = {}

    for (const schema of schemas) {
      const collectionName = this.guessCollectionName(schema.tableName)
      if (collectionName) {
        const fieldMappings = await this.generateTableMappings(schema, collectionName)
        mappings[collectionName as keyof CollectionMappings] = fieldMappings
      }
    }

    return mappings
  }

  private guessCollectionName(tableName: string): string | null {
    const tableNameLower = tableName.toLowerCase()
    
    if (tableNameLower.includes('tag')) return 'tags'
    if (tableNameLower.includes('music')) return 'music'
    if (tableNameLower.includes('frame')) return 'frames'
    if (tableNameLower.includes('meditation')) return 'meditations'
    
    return null
  }

  private async generateTableMappings(
    schema: TableSchema,
    collectionName: string
  ): Promise<FieldMapping[]> {
    console.log(chalk.blue(`\n=== Mapping ${schema.tableName} to ${collectionName} ===`))
    
    const mappings: FieldMapping[] = []
    const payloadFields = this.getPayloadFields(collectionName)

    for (const column of schema.columns) {
      const proposedMapping = this.proposeMapping(column.columnName, payloadFields, schema)
      
      if (proposedMapping) {
        const confirmed = await this.confirmMapping(
          column.columnName,
          column.dataType,
          proposedMapping
        )
        
        if (confirmed) {
          mappings.push(confirmed)
        }
      }
    }

    return mappings
  }

  private getPayloadFields(collectionName: string): string[] {
    const fieldsMap: Record<string, string[]> = {
      tags: ['title'],
      music: ['title', 'slug', 'duration', 'tags', 'credit'],
      frames: ['name', 'imageSet', 'tags', 'dimensions', 'duration'],
      meditations: [
        'title', 'locale', 'slug', 'thumbnail', 'duration',
        'narrator', 'tags', 'musicTag', 'isPublished', 'publishedDate', 'frames'
      ],
    }

    return fieldsMap[collectionName] || []
  }

  private proposeMapping(
    columnName: string,
    payloadFields: string[],
    schema: TableSchema
  ): FieldMapping | null {
    const columnNameLower = columnName.toLowerCase()
    
    // Check for foreign keys first
    const foreignKey = schema.foreignKeys.find(fk => fk.columnName === columnName)
    if (foreignKey) {
      return this.proposeForeignKeyMapping(columnName, foreignKey.referencedTable)
    }

    // Direct field name matches
    for (const field of payloadFields) {
      if (field.toLowerCase() === columnNameLower) {
        return { sourceColumn: columnName, targetField: field }
      }
    }

    // Common name mappings
    const commonMappings: Record<string, string> = {
      'name': 'title',
      'description': 'credit',
      'published': 'isPublished',
      'published_at': 'publishedDate',
      'created_at': 'createdAt',
      'updated_at': 'updatedAt',
      'image_set': 'imageSet',
      'music_tag': 'musicTag',
    }

    for (const [pattern, field] of Object.entries(commonMappings)) {
      if (columnNameLower.includes(pattern) && payloadFields.includes(field)) {
        return { sourceColumn: columnName, targetField: field }
      }
    }

    // Handle tags field specially (comma-separated to array)
    if (columnNameLower.includes('tag') && payloadFields.includes('tags')) {
      return {
        sourceColumn: columnName,
        targetField: 'tags',
        transform: this.createTagsTransform(),
      }
    }

    return null
  }

  private proposeForeignKeyMapping(columnName: string, referencedTable: string): FieldMapping {
    const collectionName = this.guessCollectionName(referencedTable)
    
    if (collectionName) {
      return {
        sourceColumn: columnName,
        targetField: columnName.replace(/_id$/, ''),
        isRelationship: true,
        relationTo: collectionName,
      }
    }

    return {
      sourceColumn: columnName,
      targetField: columnName,
    }
  }

  private createTagsTransform() {
    return (value: string) => {
      if (!value) return []
      return value.split(',').map(tag => tag.trim()).filter(Boolean)
    }
  }

  private async confirmMapping(
    columnName: string,
    dataType: string,
    proposed: FieldMapping
  ): Promise<FieldMapping | null> {
    const relationshipInfo = proposed.isRelationship 
      ? chalk.yellow(` → ${proposed.relationTo}`)
      : ''
    
    const transformInfo = proposed.transform
      ? chalk.cyan(' [with transformation]')
      : ''

    console.log(
      `  ${chalk.gray(columnName)} (${dataType}) → ` +
      `${chalk.green(proposed.targetField)}${relationshipInfo}${transformInfo}`
    )

    const answer = await this.rl.question(
      `    Confirm mapping? [Y/n/edit]: `
    )

    if (answer.toLowerCase() === 'n') {
      return null
    }

    if (answer.toLowerCase() === 'edit') {
      const newTarget = await this.rl.question(`    Enter target field name: `)
      return {
        ...proposed,
        targetField: newTarget,
      }
    }

    return proposed
  }

  async saveToFile(mappings: CollectionMappings, filepath: string): Promise<void> {
    const fs = await import('fs/promises')
    const config = {
      mappings,
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
    }

    await fs.writeFile(filepath, JSON.stringify(config, null, 2))
    console.log(chalk.green(`\n✓ Mappings saved to ${filepath}`))
  }

  async loadFromFile(filepath: string): Promise<CollectionMappings> {
    const fs = await import('fs/promises')
    const content = await fs.readFile(filepath, 'utf-8')
    const config = JSON.parse(content)
    return config.mappings
  }

  close(): void {
    this.rl.close()
  }
}