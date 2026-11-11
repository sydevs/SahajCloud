import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Data only — no DDL; the `.json` is the prior snapshot re-stamped
// (`src/migrations/AGENTS.md`). The column keeps its type: what changes is that
// `Clients.mailingList.apiKey` is now `secretField`, whose `afterRead` decrypts
// every stored value. Without this pass that hook meets plaintext on every
// service that already has a key, and answers null — a configured mailing list
// silently reading as unconfigured.
//
// ⚠ **The rows are converted one at a time, in this transaction, through
// Payload's own cipher.** There is no SQL that does it: the key is derived from
// `PAYLOAD_SECRET`, which the database knows nothing about.
//
// ⚠ **A blank column is left alone, both ways**, for the reason `secretField`
// skips one (`src/fields/AGENTS.md`): ciphertext for the empty string is a
// non-empty string, and `LIST_ELIGIBLE` reads that column as "not equal to the
// empty string" to tell a configured service from a half-configured one.

type Db = MigrateUpArgs['db']

async function convert(db: Db, transform: (value: string) => string): Promise<void> {
  const { rows } = await db.execute(sql`
    SELECT "id", "mailing_list_api_key" FROM "clients"
      WHERE "mailing_list_api_key" IS NOT NULL AND "mailing_list_api_key" <> ''`)

  for (const row of rows as { id: number; mailing_list_api_key: string }[]) {
    await db.execute(sql`
      UPDATE "clients" SET "mailing_list_api_key" = ${transform(row.mailing_list_api_key)}
        WHERE "id" = ${row.id}`)
  }
}

export async function up({ db, payload }: MigrateUpArgs): Promise<void> {
  await convert(db, (value) => payload.encrypt(value))
}

export async function down({ db, payload }: MigrateDownArgs): Promise<void> {
  await convert(db, (value) => payload.decrypt(value))
}
