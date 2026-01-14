import * as migration_20260114_091001 from './20260114_091001';

export const migrations = [
  {
    up: migration_20260114_091001.up,
    down: migration_20260114_091001.down,
    name: '20260114_091001'
  },
];
