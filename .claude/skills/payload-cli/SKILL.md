---
name: payload-cli
description: Run Payload CLI work that dies silently or hangs on a prompt — generate:types, db:migrations:create, or any script that boots the config. Use when a Payload command exits 0 with no output and no files, or appears to hang.
---

# Payload CLI — when it dies silently or hangs

Two failure modes account for nearly every "the Payload command did nothing"
report in this repo. Both look like success from the shell.

## 1. Exit 0, no output, no files

`payload/bin.js` runs `void start()` with no `.catch()`, so any rejection while
loading the config vanishes — most often the `serverEnv` validation throwing
because `.env` wasn't in the process environment. The command prints its own
`$ payload generate:types` echo and exits 0.

**Escalation ladder.** Each rung is what to try when the one above still exits
with nothing:

1. **`dangerouslyDisableSandbox: true`** on the Bash call.
2. **Preload the env and redirect to a file.** Piping to `tail`/`grep` also
   loses the output — redirect, then `cat`:
   ```bash
   set -a; . ./.env; . ./.env.local; set +a
   timeout 240 pnpm exec payload generate:types > /tmp/gt.log 2>&1; echo "exit=$?"; cat /tmp/gt.log
   ```
3. **Skip the CLI**, using `interactive.py` below. `migrate:create` in
   particular stays silent even at rung 2, because it also hits the prompts.

Diagnose the underlying throw with a bare boot, which has no `void start()` to
swallow it:

```bash
set -a; . ./.env; . ./.env.local; set +a
node --no-warnings --input-type=module --import tsx/esm -e "
  process.on('unhandledRejection', e => { console.error('UNHANDLED:', e); process.exit(1) })
  const config = (await import('./src/payload.config.ts')).default
  console.log('loaded', (await config).collections.length)"
```

**Always verify generated output by content, not exit code** — `grep` the new
field name in `src/payload-types.ts` after `generate:types`.

## 2. It hangs on a drizzle prompt

Dev `push: true` and `migrate:create` both ask interactive questions that no
flag suppresses: a rename-vs-create select per column, and a data-loss `y/N`.
Piped stdin doesn't reach them — they need a terminal.

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

Use the same driver with a bare `getPayload({ config })` to clear the prompts
once after a schema change, then run the normal CLI.

**Output goes to `/tmp/payload-pty.log`**, not your terminal — a PTY has no
separate stdout to inherit. `grep` that file for results and for the
`[pty] answered …` lines confirming which prompts it handled.

### What it answers, and when that's wrong

| Prompt | Answer | Why |
| --- | --- | --- |
| `Is <col> column … created or renamed` | `\r` (the highlighted `+ create column`) | Right for a genuinely new column |
| `Accept warnings and push schema…` | `y` | This drives a **local dev** database; production applies migrations and never sees it |

**`+ create column` is a drop+add.** For a real column rename that destroys
every value in it. Check whether the column holds rows before accepting, and
hand-edit the generated migration to `ALTER TABLE … RENAME COLUMN` (both the
table and its `_v` twin) when it does.

### Three bugs this driver already has fixed

Worth knowing if you modify it — each one presented as an unexplained hang:

- **Dedup per column, not per prompt text.** The prompts arrive back to back;
  a time-based debounce answered the first and swallowed the second.
- **Reset that memo at `Starting migration`.** Push and migration-generation
  ask the same questions, so text-keyed dedup answered only the first round.
- **Answer with `\r`.** Raw mode ignores `\n`, and `yes ''` spins the CPU.

## Related

- `.claude/rules/migrations.md` — the outcome table, and what to do with a
  generated migration once you have one.
- `.claude/skills/migration-validator/` — run it on the result before committing.
