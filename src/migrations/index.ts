import * as migration_20260424_035639_initial_schema from './20260424_035639_initial_schema';
import * as migration_20260426_105204 from './20260426_105204';
import * as migration_20260427_151731 from './20260427_151731';
import * as migration_20260428_130853 from './20260428_130853';

export const migrations = [
  {
    up: migration_20260424_035639_initial_schema.up,
    down: migration_20260424_035639_initial_schema.down,
    name: '20260424_035639_initial_schema',
  },
  {
    up: migration_20260426_105204.up,
    down: migration_20260426_105204.down,
    name: '20260426_105204',
  },
  {
    up: migration_20260427_151731.up,
    down: migration_20260427_151731.down,
    name: '20260427_151731',
  },
  {
    up: migration_20260428_130853.up,
    down: migration_20260428_130853.down,
    name: '20260428_130853'
  },
];
