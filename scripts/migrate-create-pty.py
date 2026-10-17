#!/usr/bin/env python3
"""Run `pnpm db:migrations:create` over a pty, taking the default at every
drizzle rename-vs-create prompt.

The prompt reads keypresses from a controlling terminal, so `< /dev/null` and
a piped newline both leave it unanswered. A pty gives it one, and `\\r` takes
the highlighted default, which is `create` for every column, table and enum.
That is right only when the change really is a drop plus an add — read the
generated DDL for a stray `RENAME` before committing it.

Usage: python3 scripts/migrate-create-pty.py <name> [--timeout SECONDS]

`--skip-empty` is always passed, so the blank-migration confirm never fires.
Exits with pnpm's own status, or 124 when the deadline passes first — the
same reading as `timeout`, so src/migrations/AGENTS.md's outcome table holds.

Python, not a `.ts` script: Node has no pty in its standard library, and the
`script` utility takes different flags on macOS and Linux.
"""

import argparse
import os
import pty
import re
import select
import signal
import sys
import time

# Every drizzle-kit ambiguity prompt asks "... created or renamed from another ...?"
PROMPT = re.compile(r"created or renamed from another")
ANSI = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]")
# The prompt can redraw several times as it renders. Answer only once the
# output has been quiet this long, never on a fixed delay.
QUIET_S = 1.5


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("name", help="migration name, e.g. transcript_job_relationship")
    # Above the measured 2m08s boot, as with the `timeout 300` form.
    parser.add_argument("--timeout", type=float, default=300)
    args = parser.parse_args()

    pid, fd = pty.fork()
    if pid == 0:
        os.execvp("pnpm", ["pnpm", "db:migrations:create", args.name, "--skip-empty"])

    deadline = time.monotonic() + args.timeout
    pending = ""  # output since the last answer, ANSI stripped
    last_byte = time.monotonic()
    answers = 0

    while True:
        now = time.monotonic()
        if now >= deadline:
            os.killpg(pid, signal.SIGTERM)
            os.waitpid(pid, 0)
            print(f"\n[migrate-create-pty] timed out after {args.timeout:.0f}s", file=sys.stderr)
            return 124

        ready, _, _ = select.select([fd], [], [], 0.2)
        if ready:
            try:
                chunk = os.read(fd, 4096)
            except OSError:  # EIO: the child closed the pty
                chunk = b""
            if not chunk:
                break
            sys.stdout.buffer.write(chunk)
            sys.stdout.flush()
            pending += ANSI.sub("", chunk.decode("utf-8", "replace"))
            last_byte = now
            continue

        if PROMPT.search(pending) and now - last_byte >= QUIET_S:
            os.write(fd, b"\r")
            answers += 1
            pending = ""

    _, status = os.waitpid(pid, 0)
    print(f"\n[migrate-create-pty] answered {answers} prompt(s) with the default", file=sys.stderr)
    return os.waitstatus_to_exitcode(status)


if __name__ == "__main__":
    sys.exit(main())
