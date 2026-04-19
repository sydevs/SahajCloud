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
import * as migration_20260318_111603 from './20260318_111603';
import * as migration_20260318_120000_backfill_meditation_duration from './20260318_120000_backfill_meditation_duration';
import * as migration_20260325_163622 from './20260325_163622';
import * as migration_20260406_120149 from './20260406_120149';
import * as migration_20260408_084932 from './20260408_084932';
import * as migration_20260409_135253 from './20260409_135253';
import * as migration_20260409_180000_unify_index_blocks from './20260409_180000_unify_index_blocks';
import * as migration_20260413_044949 from './20260413_044949';
import * as migration_20260413_084327 from './20260413_084327';
import * as migration_20260413_171042 from './20260413_171042';
import * as migration_20260414_023907 from './20260414_023907';
import * as migration_20260414_122411_add_lecture_drafts from './20260414_122411_add_lecture_drafts';
import * as migration_20260415_161746 from './20260415_161746';
import * as migration_20260417_132940 from './20260417_132940';
import * as migration_20260417_134418 from './20260417_134418';
import * as migration_20260419_075710_excludeToInclude from './20260419_075710_excludeToInclude';

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
    name: '20260318_083330',
  },
  {
    up: migration_20260318_111603.up,
    down: migration_20260318_111603.down,
    name: '20260318_111603',
  },
  {
    up: migration_20260318_120000_backfill_meditation_duration.up,
    down: migration_20260318_120000_backfill_meditation_duration.down,
    name: '20260318_120000_backfill_meditation_duration',
  },
  {
    up: migration_20260325_163622.up,
    down: migration_20260325_163622.down,
    name: '20260325_163622',
  },
  {
    up: migration_20260406_120149.up,
    down: migration_20260406_120149.down,
    name: '20260406_120149',
  },
  {
    up: migration_20260408_084932.up,
    down: migration_20260408_084932.down,
    name: '20260408_084932',
  },
  {
    up: migration_20260409_135253.up,
    down: migration_20260409_135253.down,
    name: '20260409_135253',
  },
  {
    up: migration_20260409_180000_unify_index_blocks.up,
    down: migration_20260409_180000_unify_index_blocks.down,
    name: '20260409_180000_unify_index_blocks',
  },
  {
    up: migration_20260413_044949.up,
    down: migration_20260413_044949.down,
    name: '20260413_044949',
  },
  {
    up: migration_20260413_084327.up,
    down: migration_20260413_084327.down,
    name: '20260413_084327',
  },
  {
    up: migration_20260413_171042.up,
    down: migration_20260413_171042.down,
    name: '20260413_171042',
  },
  {
    up: migration_20260414_023907.up,
    down: migration_20260414_023907.down,
    name: '20260414_023907',
  },
  {
    up: migration_20260414_122411_add_lecture_drafts.up,
    down: migration_20260414_122411_add_lecture_drafts.down,
    name: '20260414_122411_add_lecture_drafts',
  },
  {
    up: migration_20260415_161746.up,
    down: migration_20260415_161746.down,
    name: '20260415_161746',
  },
  {
    up: migration_20260417_132940.up,
    down: migration_20260417_132940.down,
    name: '20260417_132940',
  },
  {
    up: migration_20260417_134418.up,
    down: migration_20260417_134418.down,
    name: '20260417_134418',
  },
  {
    up: migration_20260419_075710_excludeToInclude.up,
    down: migration_20260419_075710_excludeToInclude.down,
    name: '20260419_075710_excludeToInclude'
  },
];
