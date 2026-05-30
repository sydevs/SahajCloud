---
name: reflect-session
description: Reflect on the current session and propose improvements to the Claude configuration to prevent problems from recurring. Surveys friction points and suggests changes to rules, skills, hooks, settings, AGENTS.md, or memory. Proposes only — does not modify anything. User-invoked at end of session.
disable-model-invocation: true
effort: high
allowed-tools: Read, Grep, Glob, Bash(ls:*), Bash(cat:*), Bash(find:*)
---

# Reflect on Session

A meta-skill: at the end of a session, look back at what happened and propose Claude-config changes that would make future sessions smoother.

**This skill proposes changes only. It does NOT modify any files.** Read-only by design — the user reviews proposals and decides what to apply.

## Workflow

### 1. Survey what happened

Reconstruct the session from memory:

- What was the user trying to accomplish?
- What got done? What didn't?
- Where did Claude need correction or guidance?
- Where did Claude do something unexpected, slow, or risky?
- Where did permission prompts interrupt flow?
- Where did Claude have to read multiple files to figure out something that should have been documented?
- Where did the user have to repeat themselves?

Ask the user clarifying questions if specific friction points aren't clear from your own recollection.

### 2. Categorize each friction point

| Category                | Symptom                                                                               | Likely intervention                                        |
| ----------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **Knowledge gap**       | Claude didn't know a project fact; user had to explain                                | Add to `AGENTS.md`, a `.claude/rules/*.md`, or auto-memory |
| **Skill gap**           | A multi-step workflow was reconstructed from scratch instead of one-shot              | New `.claude/skills/*` skill                               |
| **Permission friction** | Same Bash/MCP tool prompted for approval repeatedly                                   | Add to `.claude/settings.json` permissions allow list      |
| **Hook gap**            | A manual step ran after every change (e.g., regenerate types) that wasn't automated   | New `.claude/hooks/*` PostToolUse hook                     |
| **Memory gap**          | User correction or non-obvious decision that future Claude would benefit from knowing | Save to `~/.claude/projects/.../memory/`                   |
| **Rule scope wrong**    | A rule loaded when it shouldn't have (token waste) or didn't load when it should have | Adjust `paths:` frontmatter in the rule file               |
| **Tool gap**            | Claude lacked access to a tool that would have been useful (MCP, etc.)                | Add to `.mcp.json`                                         |
| **Style mismatch**      | Claude's communication style didn't match the task (too verbose, too terse)           | Use or refine an output style in `.claude/output-styles/`  |
| **Documentation drift** | Docs said one thing but reality was another                                           | Update the stale doc                                       |

### 3. Propose specific changes

For each friction point, write a concrete proposal:

```markdown
### Proposal N: [short title]

- **Friction observed:** [What slowed things down or went wrong]
- **Category:** [from table above]
- **Proposed change:**
  - File: `path/to/file`
  - Change: [specific addition / removal / edit, with content sketch]
- **Why this helps:** [How future sessions benefit]
- **Effort:** [5 min / 30 min / 2 hr]
- **Risk:** [Low / Medium / High — what could go wrong]
```

Order proposals by **(impact / effort) ratio** — quick wins first.

### 4. Identify _non_-actionable observations

Some friction is normal, not config gaps:

- Claude wrote sloppy code on the first try and the user corrected it — that's how the work happens, not a config problem
- A novel one-off task — no permanent intervention warranted
- Something that's already handled but Claude forgot to use it — flag the existing tool; don't add a new one

Briefly list these so the user knows they were considered and dismissed.

### 5. Highlight what worked well

Equally important: note approaches the user _didn't_ push back on. If Claude made a non-obvious judgment call that the user accepted, that pattern is worth reinforcing — propose saving it as a `feedback` memory.

Per the auto-memory guidance: save from success as well as failure, or future Claude will drift away from validated approaches.

### 6. Present and wait

Output the full list of proposals. Then **stop and ask the user**:

- Which proposals would you like to apply now?
- Which should we defer to a separate session?
- Which are wrong / don't reflect what you observed?

Do NOT apply any changes. If the user picks specific proposals, they (or a follow-up session) can execute them. This skill exists to surface ideas, not to act on them.

## Output format

```markdown
## Session Reflection — <one-line task summary>

### What we worked on

[2-3 sentences]

### Proposals

1. [Proposal #1 in the format above]
2. [Proposal #2]
3. [...]

### Non-actionable observations

- [Friction that's normal / one-off / already handled]

### Worked well — worth reinforcing

- [Patterns to preserve, possibly via feedback memory]

### What I'd like clarification on (optional)

- [Friction points where I'm not sure what would help]
```

## Quality bar

A useful reflection is **specific**. Bad reflection: "Claude could have been more efficient." Good reflection: "Claude ran `pnpm test:int` 4 times when only 1 was needed because the related test file path wasn't in `.claude/rules/tests.md`. Propose adding a one-liner to that file describing where related tests live."

If a proposed change is hand-wavy ("improve documentation"), refine it until it has a file path and a content sketch.

## When NOT to use this skill

- Mid-session — wait until the work is actually done and the session is winding down
- After a trivial task — three minor file edits don't need a reflection
- When the user explicitly says "we're done, don't suggest improvements" — respect that

## Hard rules

- **Never** modify any file from this skill. Read-only.
- **Never** propose a change without a specific file path.
- **Never** pad the proposal list to look thorough — quality over quantity.
- **Always** end with explicit "which of these would you like to apply?" — don't assume.

## References

- Auto-memory format: see the project's memory system at `~/.claude/projects/.../memory/`
- Settings reference: `.claude/settings.json`, `.claude/settings.local.json`, `~/.claude/settings.json`
- Available skills: run `ls .claude/skills/`
- Available rules: run `ls .claude/rules/`
