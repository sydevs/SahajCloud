import * as migration_20261116_181127_merge_main_snapshot_10 from './20261116_181127_merge_main_snapshot_10';
import * as migration_20261117_234341_tidy_event_form from './20261117_234341_tidy_event_form';

export const migrations = [
  {
    up: migration_20261116_181127_merge_main_snapshot_10.up,
    down: migration_20261116_181127_merge_main_snapshot_10.down,
    name: '20261116_181127_merge_main_snapshot_10',
  },
  {
    up: migration_20261117_234341_tidy_event_form.up,
    down: migration_20261117_234341_tidy_event_form.down,
    name: '20261117_234341_tidy_event_form'
  },
];
