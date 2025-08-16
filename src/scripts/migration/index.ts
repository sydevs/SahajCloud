#!/usr/bin/env tsx

import { program } from 'commander'
import { config as dotenvConfig } from 'dotenv'
import { getPayload } from 'payload'
import configPromise from '../../payload.config'
import chalk from 'chalk'
import { existsSync } from 'fs'
import { resolve } from 'path'

import { DatabaseConnection, getConfigFromEnv } from './config/database'
import { SchemaAnalyzer } from './analyzers/SchemaAnalyzer'
import { MappingGenerator } from './analyzers/MappingGenerator'
import { MediaTransfer } from './utils/mediaTransfer'
import { MigrationReporter } from './utils/reporting'
import { DataValidator } from './utils/validation'

import { TagsMigrator } from './migrators/TagsMigrator'
import { MusicMigrator } from './migrators/MusicMigrator'
import { FramesMigrator } from './migrators/FramesMigrator'
import { MeditationsMigrator } from './migrators/MeditationsMigrator'

import type { MigrationConfig, CollectionMappings } from './types'

// Load environment variables
dotenvConfig()

async function main() {
  program
    .name('payload-migration')
    .description('Migrate data from PostgreSQL to Payload CMS')
    .option('-c, --config <path>', 'Path to saved mapping configuration')
    .option('-d, --dry-run', 'Run migration without writing data')
    .option('-a, --analyze-only', 'Only analyze schema without migration')
    .option('-s, --save-mappings <path>', 'Save mappings to file after analysis')
    .option('-t, --tables <tables...>', 'Specific tables to migrate')
    .parse()

  const options = program.opts()
  
  console.log(chalk.bold.blue('\n🚀 Payload CMS Data Migration Tool\n'))

  // Initialize components
  const config = getConfigFromEnv()
  config.options.dryRun = options.dryRun || false

  const db = new DatabaseConnection(config.postgres)
  const reporter = new MigrationReporter()
  
  let payload: any = null
  let mediaTransfer: MediaTransfer | null = null
  let mappingGenerator: MappingGenerator | null = null

  try {
    // Connect to PostgreSQL
    await db.connect()

    // Schema analysis
    if (options.analyzeOnly) {
      await analyzeSchema(db, options)
      return
    }

    // Initialize Payload
    if (!options.dryRun) {
      console.log('Initializing Payload CMS...')
      const payloadConfig = await configPromise
      payload = await getPayload({ config: payloadConfig })
      console.log('✓ Payload CMS initialized')
    } else {
      console.log(chalk.yellow('DRY RUN MODE - Skipping Payload initialization'))
      // Create a mock payload for dry run
      payload = {
        create: async () => ({ id: 'dry-run-id' }),
        find: async () => ({ docs: [] }),
        findByID: async () => null,
      }
    }

    // Initialize media transfer
    mediaTransfer = new MediaTransfer(payload, config.media.baseUrl)
    await mediaTransfer.initialize()

    // Load or generate mappings
    let mappings: CollectionMappings = {}
    
    if (options.config) {
      // Load saved mappings
      const configPath = resolve(options.config)
      if (!existsSync(configPath)) {
        throw new Error(`Config file not found: ${configPath}`)
      }
      
      mappingGenerator = new MappingGenerator()
      mappings = await mappingGenerator.loadFromFile(configPath)
      console.log(chalk.green(`✓ Loaded mappings from ${configPath}`))
    } else {
      // Generate mappings interactively
      console.log('\n' + chalk.blue('=== Interactive Mapping Configuration ==='))
      mappingGenerator = new MappingGenerator()
      
      const tables = options.tables || ['tags', 'music', 'frames', 'meditations']
      const analyzer = new SchemaAnalyzer(db)
      const schemas = await analyzer.analyzeTables(tables)
      
      mappings = await mappingGenerator.generateMappings(schemas)
      
      if (options.saveMappings) {
        await mappingGenerator.saveToFile(mappings, options.saveMappings)
      }
    }

    // Start migration
    reporter.startMigration()

    // Run migrations in order (dependencies first)
    const migrationOrder = [
      { name: 'tags', skip: false },
      { name: 'music', skip: false },
      { name: 'frames', skip: false },
      { name: 'meditations', skip: false },
    ]

    // Filter based on specified tables
    if (options.tables) {
      migrationOrder.forEach(m => {
        m.skip = !options.tables.includes(m.name)
      })
    }

    // Migrate tags first (as they're referenced by other collections)
    let tagsMigrator: TagsMigrator | null = null
    
    if (!migrationOrder.find(m => m.name === 'tags')?.skip) {
      tagsMigrator = new TagsMigrator(
        db,
        payload,
        mediaTransfer,
        mappings.tags || [],
        config.options
      )
      
      const tagsResult = await tagsMigrator.migrate()
      reporter.addResult(tagsResult)
    }

    // Get tag cache for other migrators
    const tagCache = tagsMigrator?.getTagCache() || new Map()

    // Migrate music
    if (!migrationOrder.find(m => m.name === 'music')?.skip) {
      const musicMigrator = new MusicMigrator(
        db,
        payload,
        mediaTransfer,
        mappings.music || [],
        config.options,
        tagCache
      )
      
      const musicResult = await musicMigrator.migrate()
      reporter.addResult(musicResult)
    }

    // Migrate frames
    let framesMigrator: FramesMigrator | null = null
    
    if (!migrationOrder.find(m => m.name === 'frames')?.skip) {
      framesMigrator = new FramesMigrator(
        db,
        payload,
        mediaTransfer,
        mappings.frames || [],
        config.options,
        tagCache
      )
      
      const framesResult = await framesMigrator.migrate()
      reporter.addResult(framesResult)
    }

    // Get frame ID map for meditations
    const frameIdMap = framesMigrator?.getFrameIdMap() || new Map()

    // Migrate meditations
    if (!migrationOrder.find(m => m.name === 'meditations')?.skip) {
      const meditationsMigrator = new MeditationsMigrator(
        db,
        payload,
        mediaTransfer,
        mappings.meditations || [],
        config.options,
        tagCache,
        frameIdMap
      )
      
      await meditationsMigrator.initialize()
      const meditationsResult = await meditationsMigrator.migrate()
      reporter.addResult(meditationsResult)
    }

    // Print final report
    reporter.printSummary(config.options.dryRun)

  } catch (error) {
    console.error(chalk.red('\n✗ Migration failed:'), error)
    process.exit(1)
  } finally {
    // Cleanup
    if (mediaTransfer) {
      await mediaTransfer.cleanup()
    }
    
    if (mappingGenerator) {
      mappingGenerator.close()
    }
    
    await db.disconnect()
  }
}

async function analyzeSchema(db: DatabaseConnection, options: any) {
  const analyzer = new SchemaAnalyzer(db)
  
  console.log(chalk.blue('=== Schema Analysis ==='))
  
  const tables = options.tables || await analyzer.getTables()
  
  for (const tableName of tables) {
    try {
      const schema = await analyzer.analyzeTable(tableName)
      analyzer.printTableSchema(schema)
    } catch (error) {
      console.error(chalk.red(`Failed to analyze ${tableName}:`), error)
    }
  }

  if (options.saveMappings) {
    console.log('\n' + chalk.blue('=== Generating Mappings ==='))
    const mappingGenerator = new MappingGenerator()
    const schemas = await analyzer.analyzeTables(tables)
    const mappings = await mappingGenerator.generateMappings(schemas)
    await mappingGenerator.saveToFile(mappings, options.saveMappings)
    mappingGenerator.close()
  }
}

// Run the migration
main().catch(error => {
  console.error(chalk.red('Fatal error:'), error)
  process.exit(1)
})