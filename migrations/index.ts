import * as migration_20251127_204442 from './20251127_204442';
import * as migration_20251202_175640 from './20251202_175640';
import * as migration_20251203_131114 from './20251203_131114';

export const migrations = [
  {
    up: migration_20251127_204442.up,
    down: migration_20251127_204442.down,
    name: '20251127_204442',
  },
  {
    up: migration_20251202_175640.up,
    down: migration_20251202_175640.down,
    name: '20251202_175640',
  },
  {
    up: migration_20251203_131114.up,
    down: migration_20251203_131114.down,
    name: '20251203_131114'
  },
];
