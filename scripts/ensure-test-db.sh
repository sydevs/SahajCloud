#!/bin/bash
#
# Ensure a local PostgreSQL cluster is serving the integration lane's test
# database. Idempotent and BEST-EFFORT: it never fails its caller, because a
# missing test database should degrade the gate, not abort a session.
#
# Why this lives in the repo rather than in the Claude routine environment:
# the environment's setup script is cached between containers, so an edit to it
# does not necessarily run. That produced three separate diagnoses of the same
# symptom — a script that exited non-zero, an auth error read as an absent
# server, and finally a container where the setup script never executed and the
# cluster simply was not started. Keeping the bring-up in git means every
# session runs the current version, whatever the environment cached.
#
# Local developers on macOS are unaffected: if anything is already answering on
# 5432 this exits immediately, and the Linux bring-up path is guarded.
#
# Usage:  scripts/ensure-test-db.sh          # silent when already up

set -u

PGPORT="${PGPORT:-5432}"
PGHOST_CHECK=127.0.0.1
PGDATA="${PGDATA:-/var/lib/postgresql/loop}"
TESTDB="${TESTDB:-payload_test}"

pg_bin() {
  # Prefer a versioned Debian path; fall back to whatever is on PATH.
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

# 1. Already serving? Nothing to do — this is the common case, including every
#    macOS dev running Postgres.app, Homebrew or Docker.
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
# PostgreSQL refuses to start on a data directory that is not 0700 or 0750, and
# `install -d -m` chmods what it finds — so this both preserves the mode and
# repairs a directory an earlier run left at 0755. It needs its own line: the
# shared one above carries `install -d`'s default 0755 to every path it names.
install -d -m 0700 -o postgres -g postgres "$PGDATA" 2>/dev/null

# 3. Clear a stale socket left by a dead postmaster. A previous container's
#    lock file survives in a warm sandbox and names a PID that no longer
#    exists, which is enough to make a fresh start look like a live server.
if [ -S "/var/run/postgresql/.s.PGSQL.$PGPORT" ] && ! pgrep -x postgres >/dev/null 2>&1; then
  rm -f "/var/run/postgresql/.s.PGSQL.$PGPORT" "/var/run/postgresql/.s.PGSQL.$PGPORT.lock" 2>/dev/null
  rm -f "$PGDATA/postmaster.pid" 2>/dev/null
fi

[ -s "$PGDATA/PG_VERSION" ] || su postgres -c "$PGBIN/initdb -D $PGDATA --auth=trust -U postgres" >/dev/null 2>&1

# One log path serves every $PGDATA and pg_ctl appends, so truncate it here or
# the failure branch below can show a previous run's lines. Truncating AS
# postgres matters: root would create it root-owned on a cold container, and
# then the postmaster could not append to its own log.
su postgres -c ": > /tmp/postgres.log" 2>/dev/null

su postgres -c "$PGBIN/pg_ctl -D $PGDATA -l /tmp/postgres.log start" >/dev/null 2>&1

if ! "$PGBIN/pg_isready" -h "$PGHOST_CHECK" -p "$PGPORT" -t 30 -q 2>/dev/null; then
  echo "ensure-test-db: cluster did not come up — integration lane unavailable" >&2
  # Redirection order is load-bearing: `2>/dev/null >&2` sends fd1 to /dev/null
  # along with fd2, discarding the very log this branch exists to print.
  tail -20 /tmp/postgres.log >&2
  exit 0
fi

su postgres -c "$PGBIN/createdb -U postgres $TESTDB" >/dev/null 2>&1
# The sandbox session runs as root and no `root` role exists, so a bare `psql`
# fails with `FATAL: role "root" does not exist` — an AUTH error that reads
# exactly like an absent server, and was misdiagnosed as one for three days.
su postgres -c "$PGBIN/createuser -s root" >/dev/null 2>&1

echo "ensure-test-db: PostgreSQL ready on $PGHOST_CHECK:$PGPORT/$TESTDB"
exit 0
