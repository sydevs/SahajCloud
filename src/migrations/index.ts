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
import * as migration_20260205_111409 from './20260205_111409';
import * as migration_20260205_114049 from './20260205_114049';
import * as migration_20260206_041908 from './20260206_041908';
import * as migration_20260206_041909_delete_timing_tags from './20260206_041909_delete_timing_tags';
import * as migration_20260206_070436 from './20260206_070436';
import * as migration_20260207_090000_fix_meditations_version_parent from './20260207_090000_fix_meditations_version_parent';
import * as migration_20260208_083206 from './20260208_083206';
import * as migration_20260210_120000_remove_meditation_tags_timings from './20260210_120000_remove_meditation_tags_timings';
import * as migration_20260212_104141 from './20260212_104141';
import * as migration_20260315_120000_convert_blockquotes_to_quote_blocks from './20260315_120000_convert_blockquotes_to_quote_blocks';
import * as migration_20260318_083330 from './20260318_083330';

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
    name: '20260205_092500',
  },
  {
    up: migration_20260205_111409.up,
    down: migration_20260205_111409.down,
    name: '20260205_111409',
  },
  {
    up: migration_20260205_114049.up,
    down: migration_20260205_114049.down,
    name: '20260205_114049',
  },
  {
    up: migration_20260206_041908.up,
    down: migration_20260206_041908.down,
    name: '20260206_041908',
  },
  {
    up: migration_20260206_041909_delete_timing_tags.up,
    down: migration_20260206_041909_delete_timing_tags.down,
    name: '20260206_041909_delete_timing_tags',
  },
  {
    up: migration_20260206_070436.up,
    down: migration_20260206_070436.down,
    name: '20260206_070436',
  },
  {
    up: migration_20260207_090000_fix_meditations_version_parent.up,
    down: migration_20260207_090000_fix_meditations_version_parent.down,
    name: '20260207_090000_fix_meditations_version_parent',
  },
  {
    up: migration_20260208_083206.up,
    down: migration_20260208_083206.down,
    name: '20260208_083206',
  },
  {
    up: migration_20260210_120000_remove_meditation_tags_timings.up,
    down: migration_20260210_120000_remove_meditation_tags_timings.down,
    name: '20260210_120000_remove_meditation_tags_timings',
  },
  {
    up: migration_20260212_104141.up,
    down: migration_20260212_104141.down,
    name: '20260212_104141',
  },
  {
    up: migration_20260315_120000_convert_blockquotes_to_quote_blocks.up,
    down: migration_20260315_120000_convert_blockquotes_to_quote_blocks.down,
    name: '20260315_120000_convert_blockquotes_to_quote_blocks',
  },
  {
    up: migration_20260318_083330.up,
    down: migration_20260318_083330.down,
    name: '20260318_083330'
  },
];
