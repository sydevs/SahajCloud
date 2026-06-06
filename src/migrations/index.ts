import * as migration_20260606_050852_initial_schema from './20260606_050852_initial_schema';

export const migrations = [
  {
    up: migration_20260606_050852_initial_schema.up,
    down: migration_20260606_050852_initial_schema.down,
    name: '20260606_050852_initial_schema'
  },
];
