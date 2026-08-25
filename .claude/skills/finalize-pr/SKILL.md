---
name: finalize-pr
description: Finalize the current branch's PR — simplify, code-review, conditional security-review, run tests, sync docs, push, create or update the PR, watch CI and fix failures, and refresh the PR description. User-invoked; also run by /implement-issue. Does not run unless explicitly triggered.
disable-model-invocation: true
effort: max
allowed-tools: Bash(*), Read, Edit, Write, Grep, Glob, Task
---

# Finalize PR

The reusable **ship pipeline**: take the current branch's accumulated local commits and ship them —
simplify → code-review → conditional security-review → test → docs sync → push → open/refresh the
PR → get CI green → report.

This is **phase 3** of the PR workflow (Implement → Adjust → **Finalize**) documented in `AGENTS.md`.
`/implement-issue` runs this pipeline at the end of its implementation; you also run it directly
(`/finalize-pr`) once you're happy with a batch of local-only Adjust-phase commits — it's what turns
those un-pushed commits into one pushed PR + one CI run.

## Invocation

```
/finalize-pr
```

Operates on the current branch — no arguments. Run it from the feature branch you want to ship.

## Pipeline

The diff to review/ship is the **whole branch** — every commit since it diverged from `main`, the
range `origin/main...HEAD` — not just the last commit. Reuse that range throughout.

### 0. Pre-flight

```bash
git branch --show-current                 # must NOT be main / a shared branch
git status --short                        # working tree
git rev-list --count origin/main..HEAD    # commits to ship
```

- **Abort if on `main`** (or any shared branch).
- **Commit any pending working-tree changes first** — this is the end of the Adjust phase, so those
  uncommitted edits are part of what's shipping. If anything looks unrelated/unexpected, **stop and
  ask** rather than committing it. Never commit secrets / `.env`.
- If there's **nothing ahead of `origin/main`** and the PR (if any) is already green, say so and
  exit — nothing to finalize.

### 1. Simplify

Run the `/simplify` slash command over the **entire branch diff** (`origin/main...HEAD`). Quality
pass for reuse / simplification / efficiency / altitude — it does **not** hunt for bugs.

- Let it apply fixes; review them and revert anything undesirable.
- If it changed anything, re-run the lean gate (step 4) and commit
  (`refactor: simplify per /simplify pass`). If it made no changes, continue.
- **`/simplify` edits the working tree, and it fans out** — fixes can land minutes after dispatch,
  well after its first message. **Don't edit the same files while it runs.** Wait for its report,
  then review `git diff` as one unit. Editing in parallel makes a patch fail an assertion or a file
  read back unexpectedly, and the first suspicion is a corrupted edit rather than a second writer.
  If you must work in parallel, pick disjoint files.

### 2. Code review (`/code-review`) — single pass

Run **one** code-review pass over the full branch diff, in an **isolated context** so its file
reading doesn't bloat the main thread. **Dispatch one Task subagent** whose sole job is to run
`/code-review` at **high** effort over `origin/main...HEAD` and return its findings as a summary
(severity + `file:line` + suggested fix). Do **not** run `/code-review` inline.

**Make the deliverable explicit in the dispatch prompt.** Tell the subagent that its final message
**is** the deliverable and must contain the findings themselves — never a status update, a promise
to keep working ("I'll wait for the finder agents…"), or a pointer to a file it wrote. If its own
sub-agents haven't finished, it reports what it has and names what's missing. Without this, a
fan-out reviewer can return a progress note instead of findings, costing a `SendMessage` round trip
to retrieve the actual review.

**A "no findings" report must carry its evidence.** Require the reviewer to name the files and code
paths it actually read to reach that conclusion, and treat a clean report that shows little or no
reading as **not yet reviewed** — re-dispatch citing the gap, or read the highest-risk paths
yourself. This has already cost a real bug: a reviewer returned "no correctness bugs… production
ready" after a *single tool call* over a ~2,800-line diff, and a manual re-read then found that a
relationship's stored order was being silently dropped, so `og:image` unfurled the wrong photo. An
empty result is harder to notice than a wrong one — nothing about it looks like a failure.

- **Blocking**: triage every finding. Fix the valid ones (each as its own commit), then re-run the
  lean gate. Note any finding you dismiss with a one-line reason for the report.
- **Triage means judging, not deferring.** A reviewer's finding can be wrong: verify the claim
  against the source before acting on it, and reject it with a stated reason when it doesn't hold.
  Apply the same scepticism to a suggested *simplification* — confirm it doesn't quietly cost
  something (e.g. dropping a "redundant" generic that was carrying type inference).
- For a deeper pass you may note that the user can run the billed `/code-review ultra` (cloud,
  multi-agent) themselves — Claude cannot launch it.

### 3. Security review (conditional — only on risky paths)

Run `/security-review` **only if** the branch diff touches security-relevant paths:

```bash
git diff --name-only origin/main...HEAD | grep -E \
  'src/plugins/access/|src/collections/(Clients|Managers)/|src/collections/[^/]+/endpoints/|src/app/.*/api/|src/plugins/storage/|webhook|src/payload.config.ts'
```

- **Match** → run `/security-review` over the diff (dispatch a subagent to keep the thread lean —
  or the custom `security-reviewer` agent for a deeper pass), triage + fix its findings (each its
  own commit), re-run the lean gate.
- **No match** → skip it and say so in the report ("no security-relevant paths changed").

### 4. Lean test gate

```bash
.claude/skills/pr-prep/check.sh        # Tier 2: lint + unit — the canonical lean gate
```

Plus the targeted integration spec(s) for what changed:

```bash
pnpm exec vitest run tests/int/<file>.int.spec.ts --config ./vitest.config.mts
```

Fix + re-run on failure. CI runs the full Tier-3 suite on the PR — that's the real gate; don't
reproduce it locally unless debugging a red run (`pr-prep/check.sh --full`).

### 5. Docs sync

Documentation ships in the same push as the code it describes. Sweep the branch diff for doc
impact **before** pushing:

```bash
git diff --name-only origin/main...HEAD    # what changed…
grep -rn "<changed setting / env var / command / behavior>" \
  .claude/docs/ .claude/rules/ .claude/skills/ AGENTS.md DEPLOYMENT.md .env.example  # …then what documents it
```

- Check every doc surface that could describe what the diff changed: `.claude/rules/`
  (path-scoped subsystem rules), `.claude/docs/` (environment, architecture), `AGENTS.md` /
  `CLAUDE.md`, `DEPLOYMENT.md`, `.env.example`, and any `.claude/skills/*` whose workflow the
  change alters.
- Update every statement the diff makes stale (config values, env vars, commands, collection
  behavior, URLs) and document anything **new** the branch introduces (env vars, workflows,
  gotchas discovered while implementing).
- Commit doc updates as their own commit (`docs(<scope>): …`). If nothing is stale, say
  "docs checked — nothing stale" in the report.

### 6. Push

```bash
git push        # creates the remote branch on first push (git push -u origin <branch> if unset)
```

Never force-push a shared branch; never `--no-verify`.

### 7. Open or refresh the PR

```bash
gh pr view --json number,url 2>/dev/null   # does a PR already exist for this branch?
```

Write the body to a **session-unique temp file** (never a fixed `/tmp/` path — it collides
between parallel Claude instances) from `pr-template.md`:

```bash
BODY_FILE=$(mktemp -t pr-body.XXXXXX).md
# write the body to "$BODY_FILE", then:
```

- **No PR** → create it:
  ```bash
  gh pr create --title "<conventional commit title>" --body-file "$BODY_FILE" --base main
  ```
- **PR exists** → **refresh** its **title and description** so they reflect the final diff + test
  results, re-derived from the **current** `origin/main...HEAD` (Adjust-phase commits may have
  changed the story since it was opened — scope shift, dropped or added sub-feature):
  ```bash
  gh pr edit <pr> --title "<conventional commit title, re-derived>" --body-file "$BODY_FILE"
  ```
  Never leave a stale title or description from an earlier state.

### 8. Watch CI and fix (capped)

```bash
gh pr checks <pr-or-branch> --watch
gh pr checks <pr-or-branch>            # confirm final state
```

- **Green** → report.
- **Red** → `gh run view <run-id> --log-failed`, diagnose, fix locally (re-run the relevant part of
  the lean gate), commit, push, re-watch.
- **Cap at 3 fix iterations.** If CI is still red after three rounds, **stop and summarize** the
  remaining failure(s) for the user instead of looping — don't burn cycles.
- A failure **pre-existing on `main`** (not caused by this branch) → fix it in this PR and note it,
  per `.claude/skills/pr-prep/SKILL.md`.

### 9. Report

- PR URL + final CI status (green, or the capped-out summary).
- Dismissed review findings (with the one-line reasons).
- Acceptance criteria / behaviour the user should verify manually (UI screenshots, edge cases).
- **Suggest `/reflect-session`** *only if* the session hit notable friction (repeated failed
  attempts, surprising library behaviour, permission/tooling snags). Don't suggest it for a clean
  run.
- If the session surfaced a **durable, non-obvious gotcha** (e.g. *Payload's `Tooltip` is
  `display:none` below 1024px*), **nudge the user to save it to memory** so future sessions don't
  re-derive it.

## Hard rules

- **Never** force-push to `main`/any shared branch; **never** `--no-verify`; **never** commit
  secrets / `.env`.
- **Never** report success while CI is red.
- **Always** run `/simplify` and `/code-review` over the **full branch diff**, not just the last commit.
- **Always** run `/code-review` (and the conditional `/security-review`) via a **dispatched Task
  subagent**, never inline in the main thread.
- **Always** use `--body-file` (a `mktemp` path) for `gh pr create` / `gh pr edit`; always refresh
  a stale PR **title and** body to match the current `origin/main...HEAD`.
- **Always** run the docs sync (step 5) before pushing — stale docs must not ship with the push.
- **Cap** the CI fix-loop at 3 iterations, then hand back to the user.

## References

- PR body template: `pr-template.md`
- Lean / `--full` gate + pre-existing-failure handling: `.claude/skills/pr-prep/`
- 3-phase PR workflow: `AGENTS.md` → "PR workflow"
- Commit conventions (HEREDOC + `Co-Authored-By`): `.claude/skills/draft-ticket/conventions.md`,
  `CLAUDE.md`
