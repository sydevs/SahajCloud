import * as migration_20260122_065154 from './20260122_065154';
import * as migration_20260125_051733 from './20260125_051733';

export const migrations = [
  {
    up: migration_20260122_065154.up,
    down: migration_20260122_065154.down,
    name: '20260122_065154',
  },
  {
    up: migration_20260125_051733.up,
    down: migration_20260125_051733.down,
    name: '20260125_051733'
  },
];
