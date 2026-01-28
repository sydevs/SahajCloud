import * as migration_20260122_065154 from './20260122_065154';
import * as migration_20260125_051733 from './20260125_051733';
import * as migration_20260126_104313 from './20260126_104313';
import * as migration_20260128_130731 from './20260128_130731';

export const migrations = [
  {
    up: migration_20260122_065154.up,
    down: migration_20260122_065154.down,
    name: '20260122_065154',
  },
  {
    up: migration_20260125_051733.up,
    down: migration_20260125_051733.down,
    name: '20260125_051733',
  },
  {
    up: migration_20260126_104313.up,
    down: migration_20260126_104313.down,
    name: '20260126_104313',
  },
  {
    up: migration_20260128_130731.up,
    down: migration_20260128_130731.down,
    name: '20260128_130731'
  },
];
