/**
 * `pnpm seed atlas-reset` — empty the collections an Atlas re-sync rebuilds
 * from scratch: events (with their versions), regions, user-submissions, and
 * users. Managers and clients are reconciled in place by `pnpm seed atlas
 * --update` instead, and are never touched here.
 *
 * ⚠ Destructive and irreversible. Run it with `--dry-run` first: that reports
 * what would go. Take a database backup before running it against production.
 *
 * **One transaction of plain DELETEs, below the Local API, on purpose.** A
 * per-document `payload.delete` would fire every afterDelete hook — sidebar
 * revalidation, the import-status refresh, the orphaned-user sweep — about
 * 8,000 times, and a failure halfway would leave half a map. Plain DELETE
 * (never TRUNCATE … CASCADE, which would empty `clients` through its region
 * key) applies each foreign key's own rule: every key into these tables is
 * SET NULL or CASCADE, so `clients.region` goes null until the import re-links
 * it. The run refuses to start if a RESTRICT key has appeared since.
 */
import type { Pool, PoolClient } from 'pg'

import path from 'path'

import pg from 'pg'

import { revalidateAtlasSidebar } from '@/lib/atlasSidebar/cache'

import { BaseImporter, type BaseImportOptions, type RunVerification } from '../lib'

/**
 * Deleted in this order. `_events_v` goes explicitly: its `parent_id` is SET
 * NULL, so deleting events alone would leave every version row behind.
 */
const TABLES = ['user_submissions', 'users', '_events_v', 'events', 'regions'] as const

/** Queued work that names a deleted submission and would only fail once run. */
const SUBMISSION_TASKS = ['screenSubmission', 'deliverSubmission']

export class AtlasResetImporter extends BaseImporter<BaseImportOptions> {
  protected readonly importName = 'Atlas reset'
  protected readonly cacheDir = path.resolve(process.cwd(), 'seeds/cache/atlas-reset')

  private schema = '"public"'

  private pool(): Pool {
    const pool = (this.payload.db as unknown as { pool?: Pool }).pool
    if (!pool) throw new Error('atlas-reset needs the Postgres adapter pool')
    const schemaName = (this.payload.db as unknown as { schemaName?: string }).schemaName
    this.schema = pg.escapeIdentifier(schemaName || 'public')
    return pool
  }

  private async countRows(db: Pool | PoolClient): Promise<Record<string, number>> {
    const counts: Record<string, number> = {}
    for (const table of TABLES) {
      const { rows } = await db.query<{ n: string }>(
        `select count(*)::text as n from ${this.schema}.${pg.escapeIdentifier(table)}`,
      )
      counts[table] = Number(rows[0].n)
    }
    return counts
  }

  protected async import(): Promise<void> {
    if (!this.payload)
      throw new Error('atlas-reset runs against a target; it has nothing to do offline')

    const pool = this.pool()
    const before = await this.countRows(pool)
    await this.logger.info(`Rows in scope: ${JSON.stringify(before)}`)

    const restrict = await pool.query<{ constraint: string; from: string; to: string }>(
      `select c.conname as constraint, c.conrelid::regclass::text as from, c.confrelid::regclass::text as to
         from pg_constraint c
        where c.contype = 'f' and c.confdeltype in ('r', 'a')
          and c.confrelid::regclass::text = any($1)`,
      [TABLES.flatMap((t) => [t, `${this.schema}.${t}`, `public.${t}`])],
    )
    if (restrict.rows.length) {
      throw new Error(
        `Refusing to reset: ${restrict.rows.map((r) => `${r.from} → ${r.to} (${r.constraint})`).join(', ')} ` +
          'would block or cascade differently than this script assumes. Review it first.',
      )
    }
    if (this.options.dryRun) {
      await this.logger.info(
        'Dry run — nothing deleted. Run without --dry-run to empty these tables.',
      )
      return
    }

    const client = await pool.connect()
    try {
      await client.query('begin')
      const jobs = await client.query(
        `delete from ${this.schema}."payload_jobs"
          where completed_at is null and task_slug::text = any($1)`,
        [SUBMISSION_TASKS],
      )
      const deleted: Record<string, number> = { pending_submission_jobs: jobs.rowCount ?? 0 }
      for (const table of TABLES) {
        const result = await client.query(
          `delete from ${this.schema}.${pg.escapeIdentifier(table)}`,
        )
        deleted[table] = result.rowCount ?? 0
      }
      await client.query('commit')
      await this.logger.success(`Deleted: ${JSON.stringify(deleted)}`)
    } catch (error) {
      await client.query('rollback')
      throw error
    } finally {
      client.release()
    }

    revalidateAtlasSidebar()
  }

  protected async verifyRun(): Promise<RunVerification> {
    const after = await this.countRows(this.pool())
    const left = Object.entries(after).filter(([, n]) => n > 0)
    return {
      failures: left.map(([table, n]) => `${table} still holds ${n} row(s)`),
    }
  }
}

export default AtlasResetImporter
