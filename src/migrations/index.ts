import * as migration_20251212_075410_initial_schema from './20251212_075410_initial_schema'

export const migrations = [
  {
    up: migration_20251212_075410_initial_schema.up,
    down: migration_20251212_075410_initial_schema.down,
    name: '20251212_075410_initial_schema',
  },
]
