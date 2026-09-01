"""Run a Payload script on a PTY, answering drizzle's interactive prompts.

    python3 .claude/skills/payload-cli/interactive.py "<js module source>"

The script is evaluated by `node --input-type=module --import tsx/esm -e`, from
the repo root, so it can `await import('./src/payload.config.ts')`. Everything
the child writes — including the output your script prints — goes to
`/tmp/payload-pty.log`, because a PTY has no separate stdout to inherit.

**Load `.env` and `.env.local` before calling this**, or the config's
`serverEnv` validation throws and `payload/bin.js` swallows it (`void start()`,
no `.catch()`):

    set -a; . ./.env; . ./.env.local; set +a

Three prompt-handling lessons are baked in, each learned from a hang:

  * Answer once per distinct COLUMN, not per prompt text. The rename prompts
    arrive back to back and a time-based debounce swallowed the second one.
  * Clear that memo at the `Starting migration` phase boundary. Push and
    migration-generation ask the same questions, so keying only on text
    answered the first round and hung on the second.
  * Accept the data-loss warning with `y`. Correct here because this drives a
    LOCAL dev database catching up to a schema change; production applies
    migrations instead and never sees this prompt.

Raw mode needs `\\r`, not `\\n`.

The rename prompt's highlighted default is `+ create column`, which is a
**drop+add**. That is right for a genuinely new column and destroys data for a
real rename — see `src/migrations/AGENTS.md` before accepting one on a
column that holds rows.
"""

import os
import pty
import re
import select
import subprocess
import sys
import time

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
LOG_PATH = '/tmp/payload-pty.log'

script = sys.argv[1]
log = open(LOG_PATH, 'wb', buffering=0)
master, slave = pty.openpty()
proc = subprocess.Popen(
    ['node', '--no-warnings', '--input-type=module', '--import', 'tsx/esm', '-e', script],
    stdin=slave,
    stdout=slave,
    stderr=slave,
    cwd=REPO_ROOT,
    close_fds=True,
)
os.close(slave)

seen: set[str] = set()
buf = b''
while proc.poll() is None:
    ready, _, _ = select.select([master], [], [], 1.0)
    if not ready:
        continue
    try:
        chunk = os.read(master, 65536)
    except OSError:
        break
    if not chunk:
        break
    log.write(chunk)
    buf = (buf + chunk)[-4000:]
    text = buf.decode('utf-8', 'replace')

    # Push and migration-generation ask the same questions; this boundary is
    # what lets the second round be answered too.
    if 'Starting migration' in text and 'phase2' not in seen:
        seen.clear()
        seen.add('phase2')
        buf = b''
        continue

    match = re.search(r'Is (\w+) column in (\w+) table created or renamed', text)
    if match and match.group(0) not in seen:
        seen.add(match.group(0))
        time.sleep(0.4)
        os.write(master, b'\r')
        log.write(f'\n[pty] answered `{match.group(1)}` on {match.group(2)}\n'.encode())
        buf = b''
        continue

    if 'Accept warnings and push schema to database?' in text and 'dataloss' not in seen:
        seen.add('dataloss')
        time.sleep(0.4)
        os.write(master, b'y\r')
        log.write(b'\n[pty] accepted the data-loss warning (local dev DB)\n')
        buf = b''

# Reap before reading the code: the loop above usually exits on EOF from the
# PTY, which happens *before* the child is reaped, so `returncode` would still
# be None and every run would look inconclusive.
rc = proc.wait()
log.write(f'\n[pty] exited rc={rc}\n'.encode())
print(f'[pty] done (rc={rc}) — full output in {LOG_PATH}')
sys.exit(rc)
