import * as migration_20261116_181127_merge_main_snapshot_10 from './20261116_181127_merge_main_snapshot_10';
import * as migration_20261118_210000_wm_web_new_tab_one_key from './20261118_210000_wm_web_new_tab_one_key';

export const migrations = [
  {
    up: migration_20261116_181127_merge_main_snapshot_10.up,
    down: migration_20261116_181127_merge_main_snapshot_10.down,
    name: '20261116_181127_merge_main_snapshot_10',
  },
  {
    up: migration_20261118_210000_wm_web_new_tab_one_key.up,
    down: migration_20261118_210000_wm_web_new_tab_one_key.down,
    name: '20261118_210000_wm_web_new_tab_one_key'
  },
];
