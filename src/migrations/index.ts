import * as migration_20261116_181127_merge_main_snapshot_10 from './20261116_181127_merge_main_snapshot_10';
import * as migration_20261118_181435_add_songs_duration from './20261118_181435_add_songs_duration';
import * as migration_20261118_210000_wm_web_new_tab_one_key from './20261118_210000_wm_web_new_tab_one_key';
import * as migration_20261118_231500_wm_web_a11y_landmark_keys from './20261118_231500_wm_web_a11y_landmark_keys';
import * as migration_20261118_233000_wm_web_menu_key from './20261118_233000_wm_web_menu_key';
import * as migration_20261118_235242_wm_web_drop_video_tab from './20261118_235242_wm_web_drop_video_tab';
import * as migration_20261119_044129_tidy_event_form from './20261119_044129_tidy_event_form';
import * as migration_20261119_223756_merge_snapshot_heal from './20261119_223756_merge_snapshot_heal';
import * as migration_20261121_035055_wm_web_drop_a11y_groups from './20261121_035055_wm_web_drop_a11y_groups';
import * as migration_20261121_035100_atlas_drop_a11y_keys from './20261121_035100_atlas_drop_a11y_keys';
import * as migration_20261123_185218_pages_parent_index_pages from './20261123_185218_pages_parent_index_pages';
import * as migration_20261124_042718_import_created_regions from './20261124_042718_import_created_regions';
import * as migration_20261125_152923_atlas_drop_compact_tab from './20261125_152923_atlas_drop_compact_tab';
import * as migration_20261125_191844_merge_snapshot_heal from './20261125_191844_merge_snapshot_heal';
import * as migration_20261125_194859_merge_snapshot_heal from './20261125_194859_merge_snapshot_heal';

export const migrations = [
  {
    up: migration_20261116_181127_merge_main_snapshot_10.up,
    down: migration_20261116_181127_merge_main_snapshot_10.down,
    name: '20261116_181127_merge_main_snapshot_10',
  },
  {
    up: migration_20261118_181435_add_songs_duration.up,
    down: migration_20261118_181435_add_songs_duration.down,
    name: '20261118_181435_add_songs_duration',
  },
  {
    up: migration_20261118_210000_wm_web_new_tab_one_key.up,
    down: migration_20261118_210000_wm_web_new_tab_one_key.down,
    name: '20261118_210000_wm_web_new_tab_one_key',
  },
  {
    up: migration_20261118_231500_wm_web_a11y_landmark_keys.up,
    down: migration_20261118_231500_wm_web_a11y_landmark_keys.down,
    name: '20261118_231500_wm_web_a11y_landmark_keys',
  },
  {
    up: migration_20261118_233000_wm_web_menu_key.up,
    down: migration_20261118_233000_wm_web_menu_key.down,
    name: '20261118_233000_wm_web_menu_key',
  },
  {
    up: migration_20261118_235242_wm_web_drop_video_tab.up,
    down: migration_20261118_235242_wm_web_drop_video_tab.down,
    name: '20261118_235242_wm_web_drop_video_tab',
  },
  {
    up: migration_20261119_044129_tidy_event_form.up,
    down: migration_20261119_044129_tidy_event_form.down,
    name: '20261119_044129_tidy_event_form',
  },
  {
    up: migration_20261119_223756_merge_snapshot_heal.up,
    down: migration_20261119_223756_merge_snapshot_heal.down,
    name: '20261119_223756_merge_snapshot_heal',
  },
  {
    up: migration_20261121_035055_wm_web_drop_a11y_groups.up,
    down: migration_20261121_035055_wm_web_drop_a11y_groups.down,
    name: '20261121_035055_wm_web_drop_a11y_groups',
  },
  {
    up: migration_20261121_035100_atlas_drop_a11y_keys.up,
    down: migration_20261121_035100_atlas_drop_a11y_keys.down,
    name: '20261121_035100_atlas_drop_a11y_keys',
  },
  {
    up: migration_20261123_185218_pages_parent_index_pages.up,
    down: migration_20261123_185218_pages_parent_index_pages.down,
    name: '20261123_185218_pages_parent_index_pages',
  },
  {
    up: migration_20261124_042718_import_created_regions.up,
    down: migration_20261124_042718_import_created_regions.down,
    name: '20261124_042718_import_created_regions',
  },
  {
    up: migration_20261125_152923_atlas_drop_compact_tab.up,
    down: migration_20261125_152923_atlas_drop_compact_tab.down,
    name: '20261125_152923_atlas_drop_compact_tab',
  },
  {
    up: migration_20261125_191844_merge_snapshot_heal.up,
    down: migration_20261125_191844_merge_snapshot_heal.down,
    name: '20261125_191844_merge_snapshot_heal',
  },
  {
    up: migration_20261125_194859_merge_snapshot_heal.up,
    down: migration_20261125_194859_merge_snapshot_heal.down,
    name: '20261125_194859_merge_snapshot_heal'
  },
];
