import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`lecture_clips_rels\` ADD \`subtle_system_nodes_id\` integer REFERENCES subtle_system_nodes(id);`)
  await db.run(sql`CREATE INDEX \`lecture_clips_rels_subtle_system_nodes_id_idx\` ON \`lecture_clips_rels\` (\`subtle_system_nodes_id\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_lecture_clips_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`audiences_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`lecture_clips\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`audiences_id\`) REFERENCES \`audiences\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_lecture_clips_rels\`("id", "order", "parent_id", "path", "audiences_id") SELECT "id", "order", "parent_id", "path", "audiences_id" FROM \`lecture_clips_rels\`;`)
  await db.run(sql`DROP TABLE \`lecture_clips_rels\`;`)
  await db.run(sql`ALTER TABLE \`__new_lecture_clips_rels\` RENAME TO \`lecture_clips_rels\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`lecture_clips_rels_order_idx\` ON \`lecture_clips_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`lecture_clips_rels_parent_idx\` ON \`lecture_clips_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`lecture_clips_rels_path_idx\` ON \`lecture_clips_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`lecture_clips_rels_audiences_id_idx\` ON \`lecture_clips_rels\` (\`audiences_id\`);`)
}
