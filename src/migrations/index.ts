import * as migration_20251216_144201_initial_schema from './20251216_144201_initial_schema';

export const migrations = [
  {
    up: migration_20251216_144201_initial_schema.up,
    down: migration_20251216_144201_initial_schema.down,
    name: '20251216_144201_initial_schema'
  },
];
