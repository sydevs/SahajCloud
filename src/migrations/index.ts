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
    name: '20260618_132754'
  },
];
