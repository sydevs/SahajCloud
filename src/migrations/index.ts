import * as migration_20251204_185601_initial_schema from './20251204_185601_initial_schema';
import * as migration_20251206_144424 from './20251206_144424';

export const migrations = [
  {
    up: migration_20251204_185601_initial_schema.up,
    down: migration_20251204_185601_initial_schema.down,
    name: '20251204_185601_initial_schema',
  },
  {
    up: migration_20251206_144424.up,
    down: migration_20251206_144424.down,
    name: '20251206_144424'
  },
];
