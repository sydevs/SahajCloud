import * as migration_20261116_181127_merge_main_snapshot_10 from './20261116_181127_merge_main_snapshot_10';
import * as migration_20261118_181435_add_songs_duration from './20261118_181435_add_songs_duration';
import * as migration_20261118_210000_wm_web_new_tab_one_key from './20261118_210000_wm_web_new_tab_one_key';
import * as migration_20261118_231500_wm_web_a11y_landmark_keys from './20261118_231500_wm_web_a11y_landmark_keys';
import * as migration_20261118_233000_wm_web_menu_key from './20261118_233000_wm_web_menu_key';
import * as migration_20261118_235242_wm_web_drop_video_tab from './20261118_235242_wm_web_drop_video_tab';
import * as migration_20261119_044129_tidy_event_form from './20261119_044129_tidy_event_form';
import * as migration_20261119_223756_merge_snapshot_heal from './20261119_223756_merge_snapshot_heal';
import * as migration_20261119_230234_wm_web_live_session_keys from './20261119_230234_wm_web_live_session_keys';
import * as migration_20261119_231000_wm_web_live_session_copy from './20261119_231000_wm_web_live_session_copy';
import * as migration_20261120_222115_merge_snapshot_heal_live_session from './20261120_222115_merge_snapshot_heal_live_session';
import * as migration_20261121_035055_wm_web_drop_a11y_groups from './20261121_035055_wm_web_drop_a11y_groups';
import * as migration_20261121_035100_atlas_drop_a11y_keys from './20261121_035100_atlas_drop_a11y_keys';
import * as migration_20261122_182623_merge_snapshot_heal_a11y_live_session from './20261122_182623_merge_snapshot_heal_a11y_live_session';

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
    up: migration_20261119_230234_wm_web_live_session_keys.up,
    down: migration_20261119_230234_wm_web_live_session_keys.down,
    name: '20261119_230234_wm_web_live_session_keys',
  },
  {
    up: migration_20261119_231000_wm_web_live_session_copy.up,
    down: migration_20261119_231000_wm_web_live_session_copy.down,
    name: '20261119_231000_wm_web_live_session_copy',
  },
  {
    up: migration_20261120_222115_merge_snapshot_heal_live_session.up,
    down: migration_20261120_222115_merge_snapshot_heal_live_session.down,
    name: '20261120_222115_merge_snapshot_heal_live_session',
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
    up: migration_20261122_182623_merge_snapshot_heal_a11y_live_session.up,
    down: migration_20261122_182623_merge_snapshot_heal_a11y_live_session.down,
    name: '20261122_182623_merge_snapshot_heal_a11y_live_session',
  },
];
