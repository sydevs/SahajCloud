import * as migration_20260424_035639_initial_schema from './20260424_035639_initial_schema';
import * as migration_20260426_105204 from './20260426_105204';

export const migrations = [
  {
    up: migration_20260424_035639_initial_schema.up,
    down: migration_20260424_035639_initial_schema.down,
    name: '20260424_035639_initial_schema',
  },
  {
    up: migration_20260426_105204.up,
    down: migration_20260426_105204.down,
    name: '20260426_105204'
  },
];
