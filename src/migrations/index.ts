import * as migration_20261116_181127_merge_main_snapshot_10 from './20261116_181127_merge_main_snapshot_10';
import * as migration_20261118_181435_add_songs_duration from './20261118_181435_add_songs_duration';
import * as migration_20261118_210000_wm_web_new_tab_one_key from './20261118_210000_wm_web_new_tab_one_key';
import * as migration_20261118_231500_wm_web_a11y_landmark_keys from './20261118_231500_wm_web_a11y_landmark_keys';
import * as migration_20261119_044129_tidy_event_form from './20261119_044129_tidy_event_form';

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
    up: migration_20261119_044129_tidy_event_form.up,
    down: migration_20261119_044129_tidy_event_form.down,
    name: '20261119_044129_tidy_event_form'
  },
];
