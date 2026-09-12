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

Four prompt-handling lessons are built in. Each came from a real hang:

  * Answer once per distinct column, not once per prompt text. The rename
    prompts arrive back to back, and a time-based debounce swallowed the
    second one.
  * Clear that memo at the `Starting migration` phase boundary. Push and
    migration generation ask the same questions. Keying only on text
    answered the first round, then hung on the second.
  * Accept the data-loss warning with `y`. This is correct here: it drives
    a local dev database catching up to a schema change. Production
    applies migrations a different way and never sees this prompt.
  * Match on ANSI-stripped text. chalk colours the column and table names
    on a PTY, so `\\w+` cannot span the escapes sitting inside the prompt.
    The log keeps the raw bytes; only the copy we match on is stripped.

Raw mode needs `\\r`, not `\\n`.

A prompt this driver cannot parse ends the run with exit 3 and the last
200 characters it saw, rather than waiting for the caller's `timeout` to
decide. Exit 124 with an empty log means something else. The detector arms
on an **unanswered** question only: drizzle re-renders a prompt after you
answer it, so the echo sits in the buffer for the rest of the run.

Environment overrides:

  * `PAYLOAD_PTY_CWD` — run the child somewhere other than the repo root
    this file sits in, so a patched copy works from anywhere.
  * `PAYLOAD_PTY_STALL_SECONDS` — how long an unanswered question may sit
    silent before the driver gives up. Raise it for a genuinely slow run.

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

REPO_ROOT = os.environ.get('PAYLOAD_PTY_CWD') or os.path.dirname(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
)
LOG_PATH = '/tmp/payload-pty.log'
# Above this repo's own measured silence, below the caller's bound. The
# command boots the whole Payload config before it reads the schema, at
# 2m08s twice (`src/migrations/AGENTS.md`), which is why the caller waits
# 300s. A default under that turns a healthy slow boot into exit 3.
STALL_SECONDS = float(os.environ.get('PAYLOAD_PTY_STALL_SECONDS', '240'))

# chalk colours the column and table names, so the escapes sit inside the
# prompt: `Is \x1b[1m\x1b[34mcommon_chrome\x1b[39m\x1b[22m column in …`.
# `\w+` cannot span them, so every rename prompt went unmatched.
# `?` is in the parameter class for the private-mode sequences a prompt
# library wraps a select in — `\x1b[?25l` / `\x1b[?25h`. Left in, the
# cursor-show after a `?` stops QUESTION_LINE matching that line, and an
# unanswerable prompt hangs again.
ANSI = re.compile(r'\x1b\[[0-9;?]*[A-Za-z]')
RENAME_PROMPT = re.compile(r'Is (\w+) column in (\w+) table created or renamed')
DATALOSS_PROMPT = 'Accept warnings and push schema to database?'
# Any line that ends in a question mark. Used only to tell an unanswered
# prompt from ordinary silence.
QUESTION_LINE = re.compile(r'^.*\?[ \t\r]*$', re.M)

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


def give_up(text):
    """End the run on a prompt we could not answer, instead of hanging."""
    message = (
        f'\n[pty] gave up: saw a prompt I could not parse, silent for {STALL_SECONDS:.0f}s\n'
        f'[pty] last 200 chars: {text[-200:]!r}\n'
        f'[pty] raise PAYLOAD_PTY_STALL_SECONDS if the run was merely slow\n'
    )
    log.write(message.encode())
    proc.kill()
    proc.wait()
    sys.stderr.write(message)
    sys.stderr.write(f'[pty] gave up — full output in {LOG_PATH}\n')
    sys.exit(3)


seen: set[str] = set()


def unanswered(text):
    """The question lines in `text` this driver has not already answered.

    Answering a prompt clears `buf`, but drizzle re-renders the prompt
    afterwards and that echo lands straight back in it. The echo restarts
    the silence clock, so it cannot trip the detector itself — but it stays
    in `buf` armed, and the next genuinely quiet stretch (the migration
    write, a slow boot) then gives up over a prompt we did answer. Match
    each question line against what `seen` records instead.
    """
    answered = {p for p in seen if p not in ('phase2', 'dataloss')}
    if 'dataloss' in seen:
        answered.add(DATALOSS_PROMPT)
    return [
        line
        for line in QUESTION_LINE.findall(text)
        if not any(prompt in line for prompt in answered)
    ]


buf = b''
last_output = time.monotonic()
while proc.poll() is None:
    ready, _, _ = select.select([master], [], [], 1.0)
    if not ready:
        # A question we never answered, sitting silent, is the hang this
        # driver exists to prevent. Say so instead of waiting for the
        # caller's `timeout`.
        if buf and time.monotonic() - last_output > STALL_SECONDS:
            stalled = ANSI.sub('', buf.decode('utf-8', 'replace'))
            if unanswered(stalled):
                give_up(stalled)
        continue
    try:
        chunk = os.read(master, 65536)
    except OSError:
        break
    if not chunk:
        break
    log.write(chunk)
    last_output = time.monotonic()
    buf = (buf + chunk)[-4000:]
    text = ANSI.sub('', buf.decode('utf-8', 'replace'))

    # Push and migration generation ask the same questions. This boundary
    # is what lets the second round get answered too.
    if 'Starting migration' in text and 'phase2' not in seen:
        seen.clear()
        seen.add('phase2')
        buf = b''
        continue

    match = RENAME_PROMPT.search(text)
    if match and match.group(0) not in seen:
        seen.add(match.group(0))
        time.sleep(0.4)
        os.write(master, b'\r')
        log.write(f'\n[pty] answered `{match.group(1)}` on {match.group(2)}\n'.encode())
        buf = b''
        continue

    if DATALOSS_PROMPT in text and 'dataloss' not in seen:
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
