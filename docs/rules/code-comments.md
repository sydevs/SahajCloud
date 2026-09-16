---
description: When a code comment earns its place, and which comments must never be deleted.
---

# Code comments

<!-- canonical:start — synced from claude-workflow/docs/code-comments.md. Edit there, not here. -->

- **Default to no comment.** Code shows *how*. A comment earns its place only by carrying *why* — a
  non-obvious constraint, a deliberate deviation, a gotcha, a workaround, or the reason a simpler
  version is wrong.
- **Never narrate the code.** No "loop over the users", no restating a name, a type or a signature,
  no `} // end if`.
- **Never narrate the change.** No "updated to", "as requested", "fixed the off-by-one". A comment
  must read correctly to someone who opens the file fresh and never saw the diff. Change context
  belongs in the commit message.
- **Never point at a moving target.** A spec section, a requirements doc, a design doc — all get
  superseded. Encode the substance instead. A ticket number, an RFC, a permalink, or a maintained
  doc at a stable path stays fine as a breadcrumb.
- **Apply the razor to every comment you keep, not only to the ones you cut.** "Carries a real
  *why*" and "is worded minimally" are separate judgements. A genuine *why* can still be three times
  too long. A five-line block rarely survives intact.
- **A one-line summary on a public function or endpoint is fine.** Restating a single clear line
  never is.
- **Never delete a tool directive, a `⚠` line, a cross-repo sync pointer, or a `#NNN` breadcrumb.**
  Directives change what a compiler, linter or formatter does. `⚠` is this workspace's own
  load-bearing marker. Nothing but prose enforces the couplings between these five repos.

TODOs are fine and need no issue ID. A TODO is a marker, not a substitute for the work.

<!-- canonical:end -->

## Carve-outs for this repo

These comments are required. Never treat one as noise.

- **The `// Icon:` comment above every `imageURL`** in `src/lib/richEditor/blocks/`. See that
  directory's `AGENTS.md` — a later edit cannot tell which icon a URL points at without it.
- **An endpoint that skips the client guard needs a comment saying why** (`docs/rules/endpoints.md`).
- **The `resolveManagedDocIds` JSDoc** owns the two hazards a per-request memo opens — the staleness
  window it pins, and why it must not be lifted to the access function (`docs/rules/access.md`).
  Read it before you widen the key.
- **JSDoc on types in `src/types/`** (`src/types/AGENTS.md`).

And one comment that must never exist: **never write a comment claiming a mutation "persists via
pass-by-reference."** It does not. That false comment once cost a working `afterChange` hook
(`c6d1b37`, #276). See `docs/rules/storage.md`.

`seeds/` and `tests/` carry most of this repo's narration. They are the first place to look.
