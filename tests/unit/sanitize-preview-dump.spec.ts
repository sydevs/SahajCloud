import { describe, expect, it } from 'vitest'

import { sanitizeDump } from '../../scripts/sanitize-preview-dump'

describe('sanitizeDump', () => {
  it('strips INSERTs for managers and clients', () => {
    const sql = `
INSERT INTO meditations VALUES (1, 'hello');
INSERT INTO managers VALUES (1, 'admin@example.com', 'hashed-password');
INSERT INTO clients VALUES (1, 'api-key-abc');
INSERT INTO songs VALUES (1, 'song');
`
    const result = sanitizeDump(sql)
    expect(result).toContain('INSERT INTO meditations')
    expect(result).toContain('INSERT INTO songs')
    expect(result).not.toContain('INSERT INTO managers')
    expect(result).not.toContain('INSERT INTO clients')
  })

  it('strips session, preference, and lock tables', () => {
    const sql = `
INSERT INTO managers_sessions VALUES (1);
INSERT INTO payload_preferences VALUES (1);
INSERT INTO payload_locked_documents VALUES (1);
INSERT INTO pages VALUES (1, 'home');
`
    const result = sanitizeDump(sql)
    expect(result).not.toContain('managers_sessions')
    expect(result).not.toContain('payload_preferences')
    expect(result).not.toContain('payload_locked_documents')
    expect(result).toContain('INSERT INTO pages')
  })

  it('strips form_submissions and job-system tables', () => {
    const sql = `
INSERT INTO form_submissions VALUES (1, 'user-data');
INSERT INTO form_submissions_submission_data VALUES (1);
INSERT INTO payload_jobs VALUES (1);
INSERT INTO payload_jobs_log VALUES (1);
INSERT INTO payload_jobs_stats VALUES (1);
INSERT INTO forms VALUES (1, 'contact-form');
`
    const result = sanitizeDump(sql)
    expect(result).not.toContain('INSERT INTO form_submissions')
    expect(result).not.toContain('INSERT INTO payload_jobs')
    expect(result).toContain("INSERT INTO forms VALUES (1, 'contact-form')")
  })

  it('preserves CREATE TABLE statements unconditionally', () => {
    const sql = `
CREATE TABLE managers (id INTEGER PRIMARY KEY);
INSERT INTO managers VALUES (1);
CREATE TABLE meditations (id INTEGER PRIMARY KEY);
INSERT INTO meditations VALUES (1);
`
    const result = sanitizeDump(sql)
    expect(result).toContain('CREATE TABLE managers')
    expect(result).toContain('CREATE TABLE meditations')
    expect(result).not.toContain('INSERT INTO managers')
    expect(result).toContain('INSERT INTO meditations')
  })

  it('handles quoted table names', () => {
    const sql = `INSERT INTO "managers" VALUES (1);
INSERT INTO "pages" VALUES (1);`
    const result = sanitizeDump(sql)
    expect(result).not.toContain('INSERT INTO "managers"')
    expect(result).toContain('INSERT INTO "pages"')
  })

  it('respects semicolons inside string literals', () => {
    const sql = `INSERT INTO pages VALUES (1, 'hello; world');
INSERT INTO managers VALUES (1, 'bad@example.com');
INSERT INTO songs VALUES (1, 'song');`
    const result = sanitizeDump(sql)
    expect(result).toContain("INSERT INTO pages VALUES (1, 'hello; world')")
    expect(result).toContain('INSERT INTO songs')
    expect(result).not.toContain('INSERT INTO managers')
  })

  it("respects escaped single quotes ('')", () => {
    const sql = `INSERT INTO pages VALUES (1, 'it''s fine');
INSERT INTO managers VALUES (1, 'leaked');`
    const result = sanitizeDump(sql)
    expect(result).toContain("INSERT INTO pages VALUES (1, 'it''s fine')")
    expect(result).not.toContain('INSERT INTO managers')
  })

  it('handles INSERTs that span multiple lines via string-literal newlines', () => {
    const sql = `INSERT INTO managers VALUES (1, 'multi
line
password');
INSERT INTO meditations VALUES (1, 'ok');`
    const result = sanitizeDump(sql)
    expect(result).not.toMatch(/INSERT INTO managers/)
    expect(result).toContain("INSERT INTO meditations VALUES (1, 'ok')")
  })

  it('passes through non-PII tables that share a prefix with a PII table', () => {
    const sql = `INSERT INTO clients VALUES (1);
INSERT INTO clients_external VALUES (1);
INSERT INTO managerstuff VALUES (1);`
    const result = sanitizeDump(sql)
    expect(result).not.toContain('INSERT INTO clients VALUES')
    expect(result).toContain('INSERT INTO clients_external')
    expect(result).toContain('INSERT INTO managerstuff')
  })

  it('strips table-level FOREIGN KEY clauses from CREATE TABLE', () => {
    const sql = `CREATE TABLE \`pages_tags\` (
  \`order\` integer NOT NULL,
  \`parent_id\` integer NOT NULL,
  \`id\` integer PRIMARY KEY NOT NULL,
  FOREIGN KEY (\`parent_id\`) REFERENCES \`pages\`(\`id\`) ON UPDATE no action ON DELETE cascade
);`
    const result = sanitizeDump(sql)
    expect(result).not.toMatch(/FOREIGN KEY/)
    expect(result).not.toMatch(/REFERENCES/)
    expect(result).toContain('CREATE TABLE `pages_tags`')
    expect(result).toContain('`id` integer PRIMARY KEY NOT NULL')
    // No dangling comma before the closing paren
    expect(result).toMatch(/PRIMARY KEY NOT NULL\s*\)/)
  })

  it('strips multiple FOREIGN KEY clauses in a single CREATE TABLE', () => {
    const sql = `CREATE TABLE rels (
  id integer PRIMARY KEY,
  a integer,
  b integer,
  FOREIGN KEY (a) REFERENCES "tbl_a"(id) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (b) REFERENCES "tbl_b"(id) ON DELETE set null
);`
    const result = sanitizeDump(sql)
    expect(result).not.toContain('FOREIGN KEY')
    expect(result).not.toContain('REFERENCES')
    expect(result).toContain('CREATE TABLE rels')
  })

  it('strips inline column-level REFERENCES clauses', () => {
    const sql = `CREATE TABLE pages (
  id integer PRIMARY KEY NOT NULL,
  featured_video_id integer REFERENCES videos(id)
);`
    const result = sanitizeDump(sql)
    expect(result).not.toContain('REFERENCES')
    expect(result).toContain('featured_video_id integer')
  })

  it('leaves CREATE INDEX / CREATE TRIGGER untouched', () => {
    const sql = `CREATE INDEX idx_pages_slug ON pages (slug);
CREATE TRIGGER t AFTER INSERT ON pages BEGIN UPDATE pages SET id = NEW.id; END;`
    const result = sanitizeDump(sql)
    expect(result).toContain('CREATE INDEX idx_pages_slug ON pages (slug)')
    expect(result).toContain('CREATE TRIGGER t AFTER INSERT ON pages')
  })
})
