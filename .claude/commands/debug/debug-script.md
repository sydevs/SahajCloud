---
description: Debug and fix script execution issues
argument-hint: <script-path-or-command>
allowed-tools: Bash(ls:*), Bash(head:*), Bash(which:*), Bash(cat:*), Bash(env:*), Bash(node:*), Read, Write, Edit, WebSearch
---

## Script Context

- Script info: !`ls -la $ARGUMENTS 2>/dev/null`
- Script shebang: !`head -1 $ARGUMENTS 2>/dev/null`
- Node version: !`node --version`
- Environment: !`env | grep -E "NODE|PATH" | head -10`

## Your Task

The following script isn't working: $ARGUMENTS

Run it and debug the issue. Keep running and fixing the errors that appear until the script works.