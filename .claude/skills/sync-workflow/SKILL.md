---
name: sync-workflow
description: Audit this repo's workflow skills against the cross-project parity spec (workflow-parity.md) and the sibling repos' copies, report drift, and — only after explicit user approval — fix it via a worktree branch + PR. User-invoked only.
disable-model-invocation: true
allowed-tools: Bash(*), Read, Edit, Write, Grep, Glob, Task
---

# Sync Workflow

Keep the shared slash-command workflow (`/draft-ticket`, `/implement-issue`, `/finalize-pr`,
`/pr-prep`) consistent across **SahajCloud**, **SahajAtlasWeb**, and **WeMeditateWeb**. The
canonical spec is `.claude/docs/workflow-parity.md` — identical in all three repos.

## Workflow

### 1. Audit (read-only)

1. **Spec parity** — diff the local spec against the sibling copies:
   ```bash
   for repo in SahajCloud SahajAtlasWeb WeMeditateWeb; do
     diff -u .claude/docs/workflow-parity.md \
       ~/Documents/Projects/$repo/.claude/docs/workflow-parity.md && echo "$repo: in sync"
   done
   ```
   Any diff means one repo's spec drifted — the newest intentional change wins; flag it.
2. **Skill compliance** — check the local skills against the spec's **Shared invariants**.
   Mechanical checks first:
   ```bash
   grep -rn '/tmp/[a-z-]*\.md' .claude/skills/            # fixed temp paths (must be mktemp)
   grep -L 'mktemp' .claude/skills/*/SKILL.md             # skills that stage gh bodies without mktemp
   grep -n 'no-worktree\|EnterWorktree' .claude/skills/implement-issue/SKILL.md   # worktree default present?
   grep -n 'Docs sync\|docs-sync\|Update documentation' .claude/skills/finalize-pr/SKILL.md
   ls .claude/skills/pr-prep/check.sh                     # canonical lean-gate path
   grep -n 'title' .claude/skills/finalize-pr/SKILL.md    # PR refresh covers title AND body
   ```
   Then read each core SKILL.md against the spec's step lists — structural drift (missing steps,
   reordered pipeline, weakened hard rules) that grep can't catch.
3. **Delta legitimacy** — anything that differs from a sibling repo must be listed in the spec's
   "Intentional per-repo deltas" table; otherwise it's drift.

### 2. Report

Present findings as a checklist — for each: **file → concrete proposed edit → which invariant or
spec section it violates**. If there is no drift, say so and stop.

### 3. Ask for approval

**Never auto-fix.** Present the checklist and ask which items to apply (AskUserQuestion, or
plan-mode approval when drafting larger edits). Only approved items proceed.

### 4. Fix (on approval)

Apply the approved edits with the standard ship mechanics, per affected repo:

1. Isolated worktree on that repo (`EnterWorktree` for the session repo; `git worktree add
   .claude/worktrees/workflow-sync -b chore/workflow-sync-<yyyymmdd> origin/main` for siblings).
2. Incremental conventional commits (`docs(skills): …` / `chore(skills): …`).
3. Push; open the PR with `gh pr create` (mktemp body file); **merge immediately**
   (`gh pr merge --squash --delete-branch`) without waiting for CI.
4. Remove the worktree after the merge (confirm the branch is fully pushed first).

If drift spans multiple repos: one worktree/branch/PR per repo. When the fix changes the shared
pipeline itself, update **all three** `workflow-parity.md` copies in the same effort.

## Hard rules

- **Never** modify anything before step 3 approval — steps 1–2 are strictly read-only.
- **Never** treat an intentional delta (spec table) as drift.
- **Always** ship fixes via worktree → branch → PR → immediate merge; never commit to `main` directly.
- **Always** keep the three `workflow-parity.md` copies byte-identical after any spec change.
