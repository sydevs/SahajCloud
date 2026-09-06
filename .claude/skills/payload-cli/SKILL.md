---
name: payload-cli
description: Run Payload CLI work that dies silently or hangs on a prompt — generate:types, db:migrations:create, or any script that boots the config. Use when a Payload command exits 0 with no output and no files, or appears to hang.
---

# Payload CLI — when it dies silently or hangs

Two failure modes explain nearly every "the command did nothing" report in this repo. Both look
like success from the shell.

## 1. Exit 0, no output, no files

`payload/bin.js` runs `void start()` with no `.catch()`. A rejection during config load vanishes —
usually `serverEnv` validation, thrown because `.env` was not in the process environment.

**Escalation ladder** — try the next rung only after the current one still exits with nothing:

1. Set **`dangerouslyDisableSandbox: true`** on the Bash call.
2. **Preload the env and redirect to a file** (`tail`/`grep` piping also loses the output):
   ```bash
   set -a; . ./.env; . ./.env.local; set +a
   timeout 240 pnpm exec payload generate:types > /tmp/gt.log 2>&1; echo "exit=$?"; cat /tmp/gt.log
   ```
3. **Skip the CLI.** Use `interactive.py`, below. `migrate:create` stays silent even at rung 2 —
   it also hits interactive prompts.

To find the underlying throw, boot the config bare — it has no `void start()` to swallow the
error:

```bash
set -a; . ./.env; . ./.env.local; set +a
node --no-warnings --input-type=module --import tsx/esm -e "
  process.on('unhandledRejection', e => { console.error('UNHANDLED:', e); process.exit(1) })
  const config = (await import('./src/payload.config.ts')).default
  console.log('loaded', (await config).collections.length)"
```

**Confirm generated output by content, not exit code.** After `generate:types`, `grep` the new
field name in `src/payload-types.ts`.

## 2. It hangs on a drizzle prompt

Dev `push: true` and `migrate:create` both ask questions no flag suppresses: a rename-vs-create
select per column, and a yes/no data-loss confirmation. Piped stdin never reaches them — they
need a real
terminal.

```bash
set -a; . ./.env; . ./.env.local; set +a
python3 .claude/skills/payload-cli/interactive.py "
  const { getPayload } = await import('payload')
  const config = (await import('./src/payload.config.ts')).default
  const payload = await getPayload({ config })
  await payload.db.createMigration({
    payload, migrationName: 'my_change', forceAcceptWarning: true, skipEmpty: true,
  })
  process.exit(0)
"
```

Run the same driver once after a schema change, with a bare `getPayload({ config })`, to clear
the prompts, then use the normal CLI.

**Output goes to `/tmp/payload-pty.log`, not your terminal** — a PTY has no separate stdout to
inherit. `grep` that file for results and for `[pty] answered …` lines, which confirm which
prompts it handled.

### What it answers, and when that answer is wrong

| Prompt                                 | Answer                                | Why                                                             |
| ----------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------ |
| `Is <col> column … created or renamed` | `\r` (highlighted `+ create column`)  | Right for a genuinely new column                                |
| `Accept warnings and push schema…`     | `y`                                    | Drives only the local dev database — production never sees this |

**`+ create column` is a drop-and-add.** For a true column rename, it destroys every existing
value. Confirm whether the column holds rows first. If it does, hand-edit the generated migration
to `ALTER TABLE … RENAME COLUMN`, for both the table and its `_v` twin.

### Three bugs already fixed in this driver

- **Dedup per column, not per prompt text** — prompts arrive back to back, and a time-based debounce
  answered the first and swallowed the second.
- **Reset that memo at `Starting migration`** — push and migration-generation ask the same
  questions, so text-keyed dedup answered only the first round.
- **Answer with `\r`** — raw mode ignores `\n`, and `yes ''` spins the CPU.

## Related

- `src/migrations/AGENTS.md` — the outcome table, and next steps for a generated migration.
- `.claude/skills/migration-validator/` — run it on the result before you commit.
