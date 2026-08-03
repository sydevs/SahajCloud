import * as migration_20260606_050852_initial_schema from './20260606_050852_initial_schema';
import * as migration_20260608_145829 from './20260608_145829';
import * as migration_20260608_174939 from './20260608_174939';
import * as migration_20260610_110456 from './20260610_110456';
import * as migration_20260610_120918 from './20260610_120918';
import * as migration_20260610_133022 from './20260610_133022';
import * as migration_20260611_105653 from './20260611_105653';
import * as migration_20260611_113758 from './20260611_113758';
import * as migration_20260614_133654 from './20260614_133654';
import * as migration_20260616_041946 from './20260616_041946';
import * as migration_20260616_053431 from './20260616_053431';
import * as migration_20260616_080758 from './20260616_080758';
import * as migration_20260617_101730 from './20260617_101730';
import * as migration_20260617_154633 from './20260617_154633';
import * as migration_20260618_132754 from './20260618_132754';
import * as migration_20260618_182202 from './20260618_182202';
import * as migration_20260619_070535 from './20260619_070535';
import * as migration_20260621_074306 from './20260621_074306';
import * as migration_20260630_181202 from './20260630_181202';
import * as migration_20260630_235640 from './20260630_235640';
import * as migration_20260701_172426 from './20260701_172426';
import * as migration_20260705_134239_drop_region_event_defaults from './20260705_134239_drop_region_event_defaults';
import * as migration_20260705_160029_sy_atlas_translations_views from './20260705_160029_sy_atlas_translations_views';
import * as migration_20260705_161112_bcp47_locales_web_translations from './20260705_161112_bcp47_locales_web_translations';
import * as migration_20260711_230013 from './20260711_230013';
import * as migration_20260713_102925 from './20260713_102925';
import * as migration_20260717_143000_add_hu_nl_locales from './20260717_143000_add_hu_nl_locales';
import * as migration_20260718_230825_add_event_website from './20260718_230825_add_event_website';
import * as migration_20260719_213905_registration_client_locale_and_client_email_branding from './20260719_213905_registration_client_locale_and_client_email_branding';
import * as migration_20260720_141351_event_registration_notification_fields from './20260720_141351_event_registration_notification_fields';
import * as migration_20260720_195203_registration_notifications from './20260720_195203_registration_notifications';
import * as migration_20260730_170909_schedule_last_date from './20260730_170909_schedule_last_date';

export const migrations = [
  {
    up: migration_20260606_050852_initial_schema.up,
    down: migration_20260606_050852_initial_schema.down,
    name: '20260606_050852_initial_schema',
  },
  {
    up: migration_20260608_145829.up,
    down: migration_20260608_145829.down,
    name: '20260608_145829',
  },
  {
    up: migration_20260608_174939.up,
    down: migration_20260608_174939.down,
    name: '20260608_174939',
  },
  {
    up: migration_20260610_110456.up,
    down: migration_20260610_110456.down,
    name: '20260610_110456',
  },
  {
    up: migration_20260610_120918.up,
    down: migration_20260610_120918.down,
    name: '20260610_120918',
  },
  {
    up: migration_20260610_133022.up,
    down: migration_20260610_133022.down,
    name: '20260610_133022',
  },
  {
    up: migration_20260611_105653.up,
    down: migration_20260611_105653.down,
    name: '20260611_105653',
  },
  {
    up: migration_20260611_113758.up,
    down: migration_20260611_113758.down,
    name: '20260611_113758',
  },
  {
    up: migration_20260614_133654.up,
    down: migration_20260614_133654.down,
    name: '20260614_133654',
  },
  {
    up: migration_20260616_041946.up,
    down: migration_20260616_041946.down,
    name: '20260616_041946',
  },
  {
    up: migration_20260616_053431.up,
    down: migration_20260616_053431.down,
    name: '20260616_053431',
  },
  {
    up: migration_20260616_080758.up,
    down: migration_20260616_080758.down,
    name: '20260616_080758',
  },
  {
    up: migration_20260617_101730.up,
    down: migration_20260617_101730.down,
    name: '20260617_101730',
  },
  {
    up: migration_20260617_154633.up,
    down: migration_20260617_154633.down,
    name: '20260617_154633',
  },
  {
    up: migration_20260618_132754.up,
    down: migration_20260618_132754.down,
    name: '20260618_132754',
  },
  {
    up: migration_20260618_182202.up,
    down: migration_20260618_182202.down,
    name: '20260618_182202',
  },
  {
    up: migration_20260619_070535.up,
    down: migration_20260619_070535.down,
    name: '20260619_070535',
  },
  {
    up: migration_20260621_074306.up,
    down: migration_20260621_074306.down,
    name: '20260621_074306',
  },
  {
    up: migration_20260630_181202.up,
    down: migration_20260630_181202.down,
    name: '20260630_181202',
  },
  {
    up: migration_20260630_235640.up,
    down: migration_20260630_235640.down,
    name: '20260630_235640',
  },
  {
    up: migration_20260701_172426.up,
    down: migration_20260701_172426.down,
    name: '20260701_172426',
  },
  {
    up: migration_20260705_134239_drop_region_event_defaults.up,
    down: migration_20260705_134239_drop_region_event_defaults.down,
    name: '20260705_134239_drop_region_event_defaults',
  },
  {
    up: migration_20260705_160029_sy_atlas_translations_views.up,
    down: migration_20260705_160029_sy_atlas_translations_views.down,
    name: '20260705_160029_sy_atlas_translations_views',
  },
  {
    up: migration_20260705_161112_bcp47_locales_web_translations.up,
    down: migration_20260705_161112_bcp47_locales_web_translations.down,
    name: '20260705_161112_bcp47_locales_web_translations',
  },
  {
    up: migration_20260711_230013.up,
    down: migration_20260711_230013.down,
    name: '20260711_230013',
  },
  {
    up: migration_20260713_102925.up,
    down: migration_20260713_102925.down,
    name: '20260713_102925',
  },
  {
    up: migration_20260717_143000_add_hu_nl_locales.up,
    down: migration_20260717_143000_add_hu_nl_locales.down,
    name: '20260717_143000_add_hu_nl_locales',
  },
  {
    up: migration_20260718_230825_add_event_website.up,
    down: migration_20260718_230825_add_event_website.down,
    name: '20260718_230825_add_event_website',
  },
  {
    up: migration_20260719_213905_registration_client_locale_and_client_email_branding.up,
    down: migration_20260719_213905_registration_client_locale_and_client_email_branding.down,
    name: '20260719_213905_registration_client_locale_and_client_email_branding',
  },
  {
    up: migration_20260720_141351_event_registration_notification_fields.up,
    down: migration_20260720_141351_event_registration_notification_fields.down,
    name: '20260720_141351_event_registration_notification_fields',
  },
  {
    up: migration_20260720_195203_registration_notifications.up,
    down: migration_20260720_195203_registration_notifications.down,
    name: '20260720_195203_registration_notifications',
  },
  {
    up: migration_20260730_170909_schedule_last_date.up,
    down: migration_20260730_170909_schedule_last_date.down,
    name: '20260730_170909_schedule_last_date'
  },
];
