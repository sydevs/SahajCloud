import * as migration_20260121_145811 from './20260121_145811';

export const migrations = [
  {
    up: migration_20260121_145811.up,
    down: migration_20260121_145811.down,
    name: '20260121_145811'
  },
];
