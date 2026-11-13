import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * Data-only: the column keeps its type, and every stored mailing-list key moves
 * from plaintext to `payload.encrypt` ciphertext. Without it `secretField`'s
 * `afterRead` meets a plaintext value on every service that already has a key,
 * fails to decrypt it, and reads the service as unconfigured.
 */
async function storedKeys({
  db,
}: MigrateDownArgs | MigrateUpArgs): Promise<{ id: number; key: string }[]> {
  const result = await db.execute(sql`
  SELECT "id", "mailing_list_api_key" AS "key"
  FROM "clients"
  WHERE "mailing_list_api_key" IS NOT NULL AND "mailing_list_api_key" <> '';`)
  return (result as unknown as { rows: { id: number; key: string }[] }).rows
}

export async function up(args: MigrateUpArgs): Promise<void> {
  for (const row of await storedKeys(args)) {
    const encrypted = args.payload.encrypt(row.key)
    await args.db.execute(
      sql`UPDATE "clients" SET "mailing_list_api_key" = ${encrypted} WHERE "id" = ${row.id};`,
    )
  }
}

export async function down(args: MigrateDownArgs): Promise<void> {
  for (const row of await storedKeys(args)) {
    const decrypted = args.payload.decrypt(row.key)
    await args.db.execute(
      sql`UPDATE "clients" SET "mailing_list_api_key" = ${decrypted} WHERE "id" = ${row.id};`,
    )
  }
}
