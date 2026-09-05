"""Run a Payload script on a PTY. This answers drizzle's interactive prompts.

    python3 .claude/skills/payload-cli/interactive.py "<js module source>"

Node evaluates the script with `--input-type=module --import tsx/esm -e`,
from the repo root, so it can `await import('./src/payload.config.ts')`.
A PTY has no separate stdout to inherit, so everything the child writes,
including your own script's output, goes to `/tmp/payload-pty.log`.

**Load `.env` and `.env.local` before you call this.** Otherwise the
config's `serverEnv` check throws, and `payload/bin.js` swallows the error
(`void start()`, with no `.catch()`):

    set -a; . ./.env; . ./.env.local; set +a

Three prompt-handling lessons are built in. Each came from a real hang:

  * Answer once per distinct column, not once per prompt text. The rename
    prompts arrive back to back, and a time-based debounce swallowed the
    second one.
  * Clear that memo at the `Starting migration` phase boundary. Push and
    migration generation ask the same questions. Keying only on text
    answered the first round, then hung on the second.
  * Accept the data-loss warning with `y`. This is correct here: it drives
    a local dev database catching up to a schema change. Production
    applies migrations a different way and never sees this prompt.

Raw mode needs `\\r`, not `\\n`.

The rename prompt highlights `+ create column` as its default answer. That
choice drops the old column and adds a new one. This is right for a
genuinely new column, but it destroys data on a real rename. Check
`src/migrations/AGENTS.md` before you accept it on a column that holds
rows.
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

    # Push and migration generation ask the same questions. This boundary
    # is what lets the second round get answered too.
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

# Reap the process before you read its exit code. The loop above usually
# exits on EOF from the PTY. This happens before the child process is
# reaped, so `returncode` would still be None, and every run would look
# inconclusive.
rc = proc.wait()
log.write(f'\n[pty] exited rc={rc}\n'.encode())
print(f'[pty] done (rc={rc}) — full output in {LOG_PATH}')
sys.exit(rc)
