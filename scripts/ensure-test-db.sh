#!/bin/bash
#
# Make sure a local PostgreSQL cluster serves the integration lane's test
# database. This script is idempotent and best-effort. It never fails
# its caller, because a missing test database should degrade the gate,
# not stop a whole session.
#
# Why this script lives in the repo, not in the Claude routine
# environment: that environment caches its setup script between
# containers, so an edit to it does not always run. That gap once
# produced three different diagnoses for the same underlying problem: a
# script that exited non-zero, an auth error that looked like a missing
# server, and a container where the setup script never ran at all and
# the cluster never started. Keeping the bring-up script in git means
# every session runs the current version, no matter what the
# environment cached.
#
# macOS developers are unaffected. If anything already answers on 5432,
# this script exits at once. The Linux bring-up path below runs only
# when needed.
#
# Usage:  scripts/ensure-test-db.sh          # silent when already up

set -u

PGPORT="${PGPORT:-5432}"
PGHOST_CHECK=127.0.0.1
PGDATA="${PGDATA:-/var/lib/postgresql/loop}"
TESTDB="${TESTDB:-payload_test}"

pg_bin() {
  # Prefer a versioned Debian path. Fall back to whatever is on PATH.
  local d
  for d in /usr/lib/postgresql/*/bin; do
    [ -x "$d/pg_ctl" ] && { echo "$d"; return 0; }
  done
  command -v pg_ctl >/dev/null 2>&1 && dirname "$(command -v pg_ctl)" && return 0
  return 1
}

ready() {
  local bin; bin=$(pg_bin 2>/dev/null)
  if [ -n "${bin:-}" ] && [ -x "$bin/pg_isready" ]; then
    "$bin/pg_isready" -h "$PGHOST_CHECK" -p "$PGPORT" -q 2>/dev/null
  else
    command -v pg_isready >/dev/null 2>&1 && pg_isready -h "$PGHOST_CHECK" -p "$PGPORT" -q 2>/dev/null
  fi
}

# 1. Already serving? Nothing to do. This is the common case, and covers
#    every macOS developer running Postgres.app, Homebrew, or Docker.
if ready; then
  exit 0
fi

PGBIN=$(pg_bin 2>/dev/null) || {
  echo "ensure-test-db: no PostgreSQL binaries found — integration lane unavailable" >&2
  exit 0
}

# 2. Only the Linux/root path attempts a bring-up. Anywhere else, say so and
#    leave the developer's own setup alone.
if [ "$(id -u)" != "0" ] || [ ! -d /usr/lib/postgresql ]; then
  echo "ensure-test-db: 5432 is not answering and this is not a root Linux sandbox." >&2
  echo "ensure-test-db: start your own PostgreSQL, or set DATABASE_URL." >&2
  exit 0
fi

id postgres >/dev/null 2>&1 || useradd -m postgres >/dev/null 2>&1
install -d -o postgres -g postgres /var/run/postgresql "$(dirname "$PGDATA")" 2>/dev/null
# PostgreSQL refuses to start when its data directory is not 0700 or
# 0750. `install -d -m` sets the mode on whatever it finds, so this line
# both keeps a correct mode and repairs a directory an earlier run left
# at 0755. This needs its own line, since the shared `install -d` call
# above applies its default mode of 0755 to every path it creates.
install -d -m 0700 -o postgres -g postgres "$PGDATA" 2>/dev/null

# 3. Clear a stale socket left by a dead postmaster. A previous
#    container's lock file can survive in a warm sandbox and name a PID
#    that no longer exists. That alone can make a fresh start look like
#    a live server.
if [ -S "/var/run/postgresql/.s.PGSQL.$PGPORT" ] && ! pgrep -x postgres >/dev/null 2>&1; then
  rm -f "/var/run/postgresql/.s.PGSQL.$PGPORT" "/var/run/postgresql/.s.PGSQL.$PGPORT.lock" 2>/dev/null
  rm -f "$PGDATA/postmaster.pid" 2>/dev/null
fi

[ -s "$PGDATA/PG_VERSION" ] || su postgres -c "$PGBIN/initdb -D $PGDATA --auth=trust -U postgres" >/dev/null 2>&1

# One log path serves every $PGDATA, and pg_ctl appends to it. Truncate
# it here, or the failure branch below can show lines from a previous
# run. Truncate it as the postgres user: root would create the file as
# root-owned on a cold container, and then the postmaster could not
# append to its own log.
su postgres -c ": > /tmp/postgres.log" 2>/dev/null

su postgres -c "$PGBIN/pg_ctl -D $PGDATA -l /tmp/postgres.log start" >/dev/null 2>&1

if ! "$PGBIN/pg_isready" -h "$PGHOST_CHECK" -p "$PGPORT" -t 30 -q 2>/dev/null; then
  echo "ensure-test-db: cluster did not come up — integration lane unavailable" >&2
  # Keep this redirection as `>&2` alone. Adding `2>/dev/null` after it
  # would send fd1 to /dev/null too, discarding the very log this branch
  # exists to print.
  tail -20 /tmp/postgres.log >&2
  exit 0
fi

su postgres -c "$PGBIN/createdb -U postgres $TESTDB" >/dev/null 2>&1
# The sandbox session runs as root, and no `root` role exists yet. A
# bare `psql` call fails with `FATAL: role "root" does not exist`. That
# error looks exactly like an absent server, and was misdiagnosed as one
# for three days.
su postgres -c "$PGBIN/createuser -s root" >/dev/null 2>&1

echo "ensure-test-db: PostgreSQL ready on $PGHOST_CHECK:$PGPORT/$TESTDB"
exit 0
