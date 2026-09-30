import { MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * Null every manager's stored password material (#840). Data only — the columns
 * stay, because Payload still declares them under `disableLocalStrategy: {
 * enableFields: true }`.
 *
 * Nothing can spend these values any more: `login`, `forgotPassword`,
 * `resetPassword` and the rest answer 403 once `loginPlugin` sets that option.
 * Nor can a new one be written: `create` hashes nothing under it, and
 * `loginPlugin` drops a `password` sent on an update, the one path that still
 * would. Nulling them is what makes "no password hash survives in the
 * database" true rather than merely inert.
 *
 * ⚠ **Irreversible, on purpose, and no dump is kept (#840).** `down` restores
 * nothing: a hash cannot be rebuilt, and restoring one would buy nothing, since
 * `login` refuses every password while `passwordless` is set. The way back to
 * passwords is removing `passwordless` from `managersLogin` and having each
 * manager set a new one.
 *
 * ⚠ **The `.json` beside this file also heals the snapshot chain.** As
 * generated, `up()` re-emitted `DROP COLUMN "login_attempts"` and
 * `"lock_until"`, which `20260928_231710_disable_manager_passwords` already
 * ships: `20260929_043344_storage_object_key.json` was generated on `main`
 * before that migration merged, so the newest-by-timestamp snapshot still had
 * both columns — the out-of-order snapshot trap, #566. This snapshot was
 * generated on the merged tree, so keeping it newest, with that DDL removed, is
 * what stops the next `migrate:create` emitting the drop a third time.
 *
 * Verify after deploy: `SELECT count(*) FROM managers WHERE hash IS NOT NULL OR
 * salt IS NOT NULL` returns 0.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   UPDATE "managers" SET
     "hash" = NULL,
     "salt" = NULL,
     "reset_password_token" = NULL,
     "reset_password_expiration" = NULL,
     "reset_password_requested_at" = NULL;`)
}

export async function down(): Promise<void> {
  // Nothing to restore — see above.
}
