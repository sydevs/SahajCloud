import * as migration_20260114_092103 from './20260114_092103'

export const migrations = [
  {
    up: migration_20260114_092103.up,
    down: migration_20260114_092103.down,
    name: '20260114_092103',
  },
]
