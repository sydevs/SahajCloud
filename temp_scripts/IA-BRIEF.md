# Brief — authoring translation-leaf information architecture

You are making the WeMeditate CMS translations editor **read the way the app screen reads**. Today a translator opens a leaf and sees one flat, arbitrarily-ordered column of keys with no idea which screen they're on, what order they appear in, or which never show at all.

## Mechanism (how the CMS renders a leaf)

- Each leaf = one sub-tab. Its **string** keys are packed into one JSON field rendered as rows; consecutive keys sharing a `section` render under one collapsible header, **in schema order**. So property order = the order a translator reads, and it must match the screen top-to-bottom.
- **richText** keys render as SEPARATE fields *after* the whole string block (known limitation). Still give them a section + description, and make the description state where the text really sits on screen.
- **Slugs are DATA** — stored translations and the English seed are keyed on them. NEVER rename or invent a key. Use ONLY the exact keys you are given. To relabel a tab, set `title` (never a new slug).

## Description style (a translator who cannot see the app reads these)

- One short, plain, non-technical line. Say WHAT the text is and WHERE/WHEN it appears.
- Edge/rare copy: lead with the condition — "Only shown if …" / "Error shown only when …".
- Fallback copy: "FALLBACK — only when …; normally <the real source> is shown."
- Matched-against, not displayed: "NOT DISPLAYED — matched against …; editing changes behaviour."
- If a string contains a `{token}` placeholder, say it must be kept.
- No jargon, no file/line references inside the description text.

## Sections

Short human headings grouping consecutive keys by on-screen area ("Buttons", "Errors", "Account details"). Keys with no natural group use section `""` (they render first, ungrouped). A section must be **contiguous** — never reuse a heading after a different one. Tiny leaves (1–4 keys) usually need no sections at all: use `""`.

## Rules

1. Use ONLY the exact keys given for the leaf. Every key must appear **exactly once** across `order` + `dead`.
2. Mark a key `dead` ONLY if you grepped the app and found **zero** usages AND you are certain. If unsure, keep it in `order` and explain in `notes`.
3. If a cluster looks unused but removing it is a **product decision**, KEEP the keys in `order`, put them in a trailing section called `Currently unused — needs a product decision`, and flag them in `notes`. Do not delete.
4. Set `title` only when the slug reads misleadingly to an editor; else `null`.

## Sources

- App repo: `/Users/antontcymbal/Projects/WeMeditate/WeMeditateApp`
  - English strings + key tree: `assets/l10n/en.yaml`
  - Screens: `lib/` — grep for the keys to find the screen and the on-screen order.
- Your leaves' exact keys: `/Users/antontcymbal/SahajCloud/temp_scripts/remaining-keys.json`
- CMS schema (reference only, DO NOT EDIT): `/Users/antontcymbal/SahajCloud/src/globals/WeMeditateAppTranslations/translationsSchema.json`

**Do not edit any repo file.** Your only write is your output JSON.

## Output

Write a JSON **array** (one object per leaf you were assigned) to the path you are given:

```json
[
  {
    "leaf": "profile.main",
    "seedKey": "profile_main",
    "title": null,
    "description": "One line describing the whole screen.",
    "order": [
      { "key": "exact_key", "section": "Section heading or empty string", "description": "Plain-prose line." }
    ],
    "dead": [],
    "misfiled": [],
    "notes": ["anything a human must decide, contract breaks, {tokens}, uncertain-dead"]
  }
]
```

Verify before writing: for each leaf, `order.length + dead.length + misfiled.length` equals the number of keys you were given, with no duplicates.
