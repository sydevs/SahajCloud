import * as migration_20260121_120903 from './20260121_120903';

export const migrations = [
  {
    up: migration_20260121_120903.up,
    down: migration_20260121_120903.down,
    name: '20260121_120903'
  },
];
