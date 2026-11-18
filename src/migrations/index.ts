import * as migration_20261116_181127_merge_main_snapshot_10 from './20261116_181127_merge_main_snapshot_10';
import * as migration_20261118_181435_add_songs_duration from './20261118_181435_add_songs_duration';
import * as migration_20261118_210000_wm_web_new_tab_one_key from './20261118_210000_wm_web_new_tab_one_key';
import * as migration_20261118_235242_wm_web_drop_video_tab from './20261118_235242_wm_web_drop_video_tab';

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
    up: migration_20261118_235242_wm_web_drop_video_tab.up,
    down: migration_20261118_235242_wm_web_drop_video_tab.down,
    name: '20261118_235242_wm_web_drop_video_tab'
  },
];
