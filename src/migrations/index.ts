import * as migration_20251212_075410_initial_schema from './20251212_075410_initial_schema'
import * as migration_20251213_000000_seed_content from './20251213_000000_seed_content'

export const migrations = [
  {
    up: migration_20251212_075410_initial_schema.up,
    down: migration_20251212_075410_initial_schema.down,
    name: '20251212_075410_initial_schema',
  },
  {
    up: migration_20251213_000000_seed_content.up,
    down: migration_20251213_000000_seed_content.down,
    name: '20251213_000000_seed_content',
  },
]
