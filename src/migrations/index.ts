import * as migration_20260114_131548 from './20260114_131548'
import * as migration_20260120_usage_fields from './20260120_usage_fields'

export const migrations = [
  {
    up: migration_20260114_131548.up,
    down: migration_20260114_131548.down,
    name: '20260114_131548',
  },
  {
    up: migration_20260120_usage_fields.up,
    down: migration_20260120_usage_fields.down,
    name: '20260120_usage_fields',
  },
]
