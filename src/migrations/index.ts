import * as migration_20251204_185601_initial_schema from './20251204_185601_initial_schema';

export const migrations = [
  {
    up: migration_20251204_185601_initial_schema.up,
    down: migration_20251204_185601_initial_schema.down,
    name: '20251204_185601_initial_schema'
  },
];
