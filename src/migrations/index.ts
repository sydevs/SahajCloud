import * as migration_20260606_050852_initial_schema from './20260606_050852_initial_schema';
import * as migration_20260608_130653_atlas_collections from './20260608_130653_atlas_collections';

export const migrations = [
  {
    up: migration_20260606_050852_initial_schema.up,
    down: migration_20260606_050852_initial_schema.down,
    name: '20260606_050852_initial_schema',
  },
  {
    up: migration_20260608_130653_atlas_collections.up,
    down: migration_20260608_130653_atlas_collections.down,
    name: '20260608_130653_atlas_collections'
  },
];
