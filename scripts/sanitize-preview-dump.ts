#!/usr/bin/env tsx
import { readFile, writeFile } from 'node:fs/promises'

/**
 * Tables whose row INSERTs are stripped from the prod dump before it lands
 * in the preview D1. These hold credentials, sessions, per-user state, or
 * user-submitted data that has no business leaving prod.
 *
 * Schema (CREATE TABLE) statements and INSERTs for every other table pass
 * through unchanged. The preview admin is re-seeded by `seed-preview-admin.sql`
 * after the import.
 */
const PII_TABLES = new Set([
  'managers',
  'managers_rels',
  'managers_roles',
  'managers_sessions',
  'clients',
  'clients_rels',
  'clients_roles',
  'payload_preferences',
  'payload_preferences_rels',
  'payload_locked_documents',
  'payload_locked_documents_rels',
  'form_submissions',
  'form_submissions_submission_data',
  'payload_jobs',
  'payload_jobs_log',
  'payload_jobs_stats',
])

/**
 * Walk the dump statement-by-statement. SQLite `.dump` output puts each
 * statement on its own line in the common case, but string literals can
 * legitimately contain `;` and `\n`, so we track string-literal state and
 * split on unescaped `;` at statement boundaries.
 */
export function sanitizeDump(sql: string): string {
  const out: string[] = []
  let i = 0

  while (i < sql.length) {
    const start = i
    let inString = false

    while (i < sql.length) {
      const c = sql[i]
      if (c === "'") {
        if (inString && sql[i + 1] === "'") {
          i += 2
          continue
        }
        inString = !inString
      } else if (c === ';' && !inString) {
        i++
        break
      }
      i++
    }

    const stmt = sql.slice(start, i)
    const trimmed = stmt.trimStart()
    const insertMatch = trimmed.match(/^INSERT\s+INTO\s+["`]?([a-zA-Z0-9_]+)["`]?/i)

    if (!insertMatch || !PII_TABLES.has(insertMatch[1])) {
      out.push(stmt)
    }
  }

  return out.join('')
}

async function main(): Promise<void> {
  const [input, output] = process.argv.slice(2)
  if (!input || !output) {
    console.error('Usage: tsx scripts/sanitize-preview-dump.ts <input.sql> <output.sql>')
    process.exit(1)
  }
  const sql = await readFile(input, 'utf8')
  const sanitized = sanitizeDump(sql)
  await writeFile(output, sanitized)
  console.log(`Sanitized ${input} → ${output}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main()
}
