import * as migration_20260122_065154 from './20260122_065154';
import * as migration_20260125_051733 from './20260125_051733';
import * as migration_20260126_104313 from './20260126_104313';
import * as migration_20260128_130731 from './20260128_130731';
import * as migration_20260203_040030 from './20260203_040030';
import * as migration_20260203_062524_add_cards_collection from './20260203_062524_add_cards_collection';
import * as migration_20260203_090000_rename_cards_to_app_cards from './20260203_090000_rename_cards_to_app_cards';
import * as migration_20260204_081140 from './20260204_081140';
import * as migration_20260204_095643 from './20260204_095643';
import * as migration_20260205_034342 from './20260205_034342';
import * as migration_20260205_092500 from './20260205_092500';

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
    name: '20260128_130731',
  },
  {
    up: migration_20260203_040030.up,
    down: migration_20260203_040030.down,
    name: '20260203_040030',
  },
  {
    up: migration_20260203_062524_add_cards_collection.up,
    down: migration_20260203_062524_add_cards_collection.down,
    name: '20260203_062524_add_cards_collection',
  },
  {
    up: migration_20260203_090000_rename_cards_to_app_cards.up,
    down: migration_20260203_090000_rename_cards_to_app_cards.down,
    name: '20260203_090000_rename_cards_to_app_cards',
  },
  {
    up: migration_20260204_081140.up,
    down: migration_20260204_081140.down,
    name: '20260204_081140',
  },
  {
    up: migration_20260204_095643.up,
    down: migration_20260204_095643.down,
    name: '20260204_095643',
  },
  {
    up: migration_20260205_034342.up,
    down: migration_20260205_034342.down,
    name: '20260205_034342',
  },
  {
    up: migration_20260205_092500.up,
    down: migration_20260205_092500.down,
    name: '20260205_092500'
  },
];
