# Well-formed issue examples

Reference examples from this repo. Read these before drafting to calibrate tone and depth.

## Detailed technical spec — issue #419

**Title:** `fix(api): correct select/populate REST format docs + tests from #294`

**What makes it good:**

- Opens with a clear Summary that names the affected PR and the three concrete consequences (real failures, masked tests, missing docs).
- Includes a verbatim example of the buggy request format and the correct format side-by-side.
- Scope of fix is explicit ("This ticket is documentation + tests only").
- Numbered sub-changes with file:line references.
- Acceptance criteria are concrete and individually checkable.
- References section links the upstream PR, related issues, and authoritative docs.

**Use as template for:** complex bug-fix tickets that touch multiple files and require careful framing.

---

## Lightweight bug report — issue #415

**Title:** `Make it possible to change userChoice icon after creating it`

**What makes it good:**

- One sentence states the problem.
- Notes a critical implementation constraint (don't migrate if it corrupts data) with a concrete consequence (delays launch).
- Includes a screenshot of the broken UI.
- Doesn't over-specify implementation — leaves room for the implementer to decide.

**Use as template for:** small bug reports where the fix is mostly self-evident.

---

## Refactor with migration plan — issue #414

**Title:** `refactor(translations): individual fields + TranslationsRow component`

**What makes it good:**

- Background section explains why the current design is fragile.
- Proposes 4 numbered changes, each with code-shape diagrams (before/after).
- Includes a migration table mapping schemas → migrations needed.
- Acceptance criteria covers data integrity, visual layout, and full test suite passing.
- Files-affected section makes blast radius explicit.

**Use as template for:** large refactors that span multiple files and require migrations.

---

## Product-spec ticket — issue #413

**Title:** `Remove public-facing meditation titles from the CMS`

**What makes it good:**

- Opens with the _why_ (product reasoning) before the _what_ (CMS change).
- Notes that composed labels work because the source strings are already localized.
- Calls out scope explicitly ("This is only the public title. Internal names / slugs are unaffected.")

**Use as template for:** product-driven changes where the "why" needs explanation before the implementer can decide tradeoffs.

---

## UX problem report — issue #412

**Title:** `Unable to edit frame labels that appear in video editor`

**What makes it good:**

- Two concrete examples of the failure modes (one mild, one critical for content quality).
- Includes a screenshot that exactly matches the described problem.
- Explains the downstream consequence ("wrong assignment of 'chakras/channels worked on'") — clarifies severity.

**Use as template for:** content-author / editor-facing bug reports.

---

## Pattern observations

Across well-formed issues in this repo:

1. **Code-level specificity.** Issues name files, fields, and behaviors. Vague "improve X" tickets don't appear.
2. **Why before what.** Product-driven changes lead with the rationale; technical bugs lead with the symptom.
3. **Constraints surfaced.** Migration risk, locale impact, backward-compat — explicitly called out.
4. **Acceptance criteria as a checklist.** Markdown task list at the bottom, each item independently verifiable.
5. **External refs.** PayloadCMS docs, Cloudflare docs, internal rule files referenced where they inform the decision.

A draft that hits all five is in good shape.
