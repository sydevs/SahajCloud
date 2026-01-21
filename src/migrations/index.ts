import * as migration_20260121_100450 from './20260121_100450';

export const migrations = [
  {
    up: migration_20260121_100450.up,
    down: migration_20260121_100450.down,
    name: '20260121_100450'
  },
];
