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
import * as migration_20261125_152923_atlas_drop_compact_tab from './20261125_152923_atlas_drop_compact_tab';
import * as migration_20261125_191844_merge_snapshot_heal from './20261125_191844_merge_snapshot_heal';
import * as migration_20261125_213000_atlas_common_copied from './20261125_213000_atlas_common_copied';
import * as migration_20261125_230000_atlas_drop_captcha_blocked from './20261125_230000_atlas_drop_captcha_blocked';
import * as migration_20261126_180000_atlas_drop_status_chips from './20261126_180000_atlas_drop_status_chips';
import * as migration_20261126_183458_atlas_filter_where_more from './20261126_183458_atlas_filter_where_more';
import * as migration_20261126_224421_atlas_drop_filters_region from './20261126_224421_atlas_drop_filters_region';
import * as migration_20261126_224500_atlas_drop_filter_labels from './20261126_224500_atlas_drop_filter_labels';
import * as migration_20261126_230014_atlas_drop_event_worded_keys from './20261126_230014_atlas_drop_event_worded_keys';
import * as migration_20261126_233000_atlas_filter_sheet_plurals from './20261126_233000_atlas_filter_sheet_plurals';
import * as migration_20261127_020000_atlas_drop_register_title_class from './20261127_020000_atlas_drop_register_title_class';
import * as migration_20261127_030000_atlas_search_placeholder from './20261127_030000_atlas_search_placeholder';
import * as migration_20261127_164504_atlas_drop_nearby_prompt from './20261127_164504_atlas_drop_nearby_prompt';
import * as migration_20261127_190000_atlas_calendar_words from './20261127_190000_atlas_calendar_words';
import * as migration_20261127_200000_atlas_filters_when from './20261127_200000_atlas_filters_when';
import * as migration_20261127_210000_atlas_drop_retired_share_keys from './20261127_210000_atlas_drop_retired_share_keys';
import * as migration_20261127_220000_atlas_filter_counts from './20261127_220000_atlas_filter_counts';
import * as migration_20261127_230000_atlas_clear_filters from './20261127_230000_atlas_clear_filters';
import * as migration_20261128_000000_atlas_times_note from './20261128_000000_atlas_times_note';

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
    up: migration_20261125_213000_atlas_common_copied.up,
    down: migration_20261125_213000_atlas_common_copied.down,
    name: '20261125_213000_atlas_common_copied',
  },
  {
    up: migration_20261125_230000_atlas_drop_captcha_blocked.up,
    down: migration_20261125_230000_atlas_drop_captcha_blocked.down,
    name: '20261125_230000_atlas_drop_captcha_blocked',
  },
  {
    up: migration_20261126_180000_atlas_drop_status_chips.up,
    down: migration_20261126_180000_atlas_drop_status_chips.down,
    name: '20261126_180000_atlas_drop_status_chips',
  },
  {
    up: migration_20261126_183458_atlas_filter_where_more.up,
    down: migration_20261126_183458_atlas_filter_where_more.down,
    name: '20261126_183458_atlas_filter_where_more',
  },
  {
    up: migration_20261126_224421_atlas_drop_filters_region.up,
    down: migration_20261126_224421_atlas_drop_filters_region.down,
    name: '20261126_224421_atlas_drop_filters_region',
  },
  {
    up: migration_20261126_224500_atlas_drop_filter_labels.up,
    down: migration_20261126_224500_atlas_drop_filter_labels.down,
    name: '20261126_224500_atlas_drop_filter_labels',
  },
  {
    up: migration_20261126_230014_atlas_drop_event_worded_keys.up,
    down: migration_20261126_230014_atlas_drop_event_worded_keys.down,
    name: '20261126_230014_atlas_drop_event_worded_keys',
  },
  {
    up: migration_20261126_233000_atlas_filter_sheet_plurals.up,
    down: migration_20261126_233000_atlas_filter_sheet_plurals.down,
    name: '20261126_233000_atlas_filter_sheet_plurals',
  },
  {
    up: migration_20261127_020000_atlas_drop_register_title_class.up,
    down: migration_20261127_020000_atlas_drop_register_title_class.down,
    name: '20261127_020000_atlas_drop_register_title_class',
  },
  {
    up: migration_20261127_030000_atlas_search_placeholder.up,
    down: migration_20261127_030000_atlas_search_placeholder.down,
    name: '20261127_030000_atlas_search_placeholder',
  },
  {
    up: migration_20261127_164504_atlas_drop_nearby_prompt.up,
    down: migration_20261127_164504_atlas_drop_nearby_prompt.down,
    name: '20261127_164504_atlas_drop_nearby_prompt'
  },
  {
    up: migration_20261127_190000_atlas_calendar_words.up,
    down: migration_20261127_190000_atlas_calendar_words.down,
    name: '20261127_190000_atlas_calendar_words',
  },
  {
    up: migration_20261127_200000_atlas_filters_when.up,
    down: migration_20261127_200000_atlas_filters_when.down,
    name: '20261127_200000_atlas_filters_when',
  },
  {
    up: migration_20261127_210000_atlas_drop_retired_share_keys.up,
    down: migration_20261127_210000_atlas_drop_retired_share_keys.down,
    name: '20261127_210000_atlas_drop_retired_share_keys',
  },
  {
    up: migration_20261127_220000_atlas_filter_counts.up,
    down: migration_20261127_220000_atlas_filter_counts.down,
    name: '20261127_220000_atlas_filter_counts',
  },
  {
    up: migration_20261127_230000_atlas_clear_filters.up,
    down: migration_20261127_230000_atlas_clear_filters.down,
    name: '20261127_230000_atlas_clear_filters',
  },
  {
    up: migration_20261128_000000_atlas_times_note.up,
    down: migration_20261128_000000_atlas_times_note.down,
    name: '20261128_000000_atlas_times_note',
  },
];
