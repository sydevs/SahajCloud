import * as migration_20260606_050852_initial_schema from './20260606_050852_initial_schema';
import * as migration_20260608_145829 from './20260608_145829';
import * as migration_20260608_174939 from './20260608_174939';

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
    name: '20260608_174939'
  },
];
