#!/bin/bash
#
# Claude Code status line: shows dev server status and current git branch.
# Output goes on a single line below the chat.

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"

# Dev server (port 3000 by default)
PORT="${PORT:-3000}"
if lsof -i ":$PORT" -t >/dev/null 2>&1; then
  SERVER="dev:🟢 :$PORT"
else
  SERVER="dev:⚫"
fi

# Git branch (suppress errors if not in a repo)
BRANCH=$(git -C "$PROJECT_DIR" branch --show-current 2>/dev/null)
[[ -z "$BRANCH" ]] && BRANCH="(detached)"

# Working tree state
DIRTY=""
if git -C "$PROJECT_DIR" diff --quiet 2>/dev/null && git -C "$PROJECT_DIR" diff --staged --quiet 2>/dev/null; then
  :
else
  DIRTY="*"
fi

echo "$SERVER  |  ${BRANCH}${DIRTY}"
