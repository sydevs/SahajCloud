# Handoff — `wm-app-translations` information architecture

**Updated:** 2026-07-17 · **Branch:** `claude/nice-shtern-4fa2c0` (SahajCloud), rebased on `origin/main`.
**Companion docs:** app-side preview engine → `WeMeditateApp/docs/_working/HANDOFF-cms-preview-2026-07-17.md`. Preview deploy → [DEPLOY-PREVIEW.md](DEPLOY-PREVIEW.md). The older [SESSION-HANDOFF-app-preview.md](SESSION-HANDOFF-app-preview.md) (2026-07-03) predates all of this and is partly stale.

## Why

Translators open a leaf and get **one flat, arbitrarily-ordered column of keys**. `daily.main` was 58 of them, with the hero title 9th and its subtitle 11th. Nothing said which screen a key is on, which order it appears in, which keys are **fallbacks that normally never show**, or which are **dead**. This is about making the leaf read the way the screen reads.

## The three rules

1. **Slugs are data. Labels are not.** The stored translations and `seeds/wm-app-translations/data.en.json` are keyed on the slug (`path_step_1`, matching the app's `assets/l10n/en.yaml`). **Renaming a slug orphans stored translations and breaks the seed.** To fix a misleading name, set `title` on the group (rendered instead of `toWords(slug)`), not a new slug.
2. **Order is authored.** Row order = property order in `translationsSchema.json`. Author the JSON in the order the strings appear on screen.
3. **Payload-native.** Sections use `@payloadcms/ui`'s **`Collapsible`** — the element the admin already uses to group fields. No custom CSS. (A previous attempt hand-rolled a header div; it was replaced. Per `.claude/rules/admin-ui.md`, reach for a built-in first.)

## The mechanism

- `src/fields/translationsField.ts`
  - `GroupSchema.title?` → tab label override.
  - `StringPropertySchema.section?` / `RichTextPropertySchema.section?` → group heading.
  - Both are non-JSON-Schema extensions, documented inline.
  - Every string key in a leaf is **one localized `json` field**; `admin.custom.schemaEntries` carries `{key, description, section}` to the renderer.
- `src/components/admin/TranslationsRow/TranslationsRowField.tsx`
  - Groups consecutive same-`section` entries, renders each in a `Collapsible` (`initCollapsed={false}`). Unsectioned keys render bare, first.
- **Description conventions** (plain prose, editors read these):
  - `FALLBACK — only when …` + name the real source (e.g. "the card's own title in App Cards").
  - `NOT DISPLAYED.` for keys matched against rather than rendered.

### ⚠ Known limitation — richText keys render detached

`TranslationsRowField` renders **only string keys** (`schemaEntries` excludes richText). Each richText key is its own Payload field, emitted **after** the whole string block, so **`section` on a richText prop is stored but never rendered**. A section mixing string + richText keys therefore splits: the strings group under the Collapsible, the richText fields land at the bottom. Affected: `onboarding.consent_modal` (3 legal paragraphs), `onboarding.carousel` (Page 2 title), `onboarding.user_type` (the question), `onboarding.welcome` (legal notice), `auth.create_account` (consent line). **Accepted for now** — each richText field carries a description stating where it really sits on screen. Fixing it means rendering the richText editors inline inside the sectioned list (bind to the sibling fields via `useField`, hide the standalone ones) — a real component change, not yet done.

## Tooling

- `temp_scripts/reorder-lib.mjs` — the engine. `applyLeaf({schema,seed}, cfg)` reorders one leaf, applies `section`/`description`, removes `dead`/`misfiled`, and syncs the seed. Handles **both seed shapes**: leaves with a richText key nest strings under `.strings` with richText siblings; leaves without are flat. Nothing is dropped silently — unaccounted keys stay at the end and are reported.
- `temp_scripts/apply-specs.mjs` + `ia-specs.json` — applies a batch of authored leaf specs through the engine.
- `temp_scripts/inspect-schema.mjs` — prints the whole schema tree (keys, sections, titles) + seed keys. Run this first when orienting.
- `temp_scripts/reorder-daily-main.mjs`, `reorder-onboarding.mjs` — the per-tab authoring scripts.

## Done — all leaves are now authored

| Commit | |
|---|---|
| `764f1cc` | Path: dropped dynamic content, relabelled sections off "Step N" |
| `09ddcd8` | Section mechanism (Collapsible) + `daily.main` fully reordered/sectioned |
| `8208ed7` | `onboarding` — all six leaves sectioned/reordered |
| `be85ace` | `daily.common`, `daily.load_info`, `explore.overview`, all five `auth` leaves, `navigation`, `general` |

- **`path`** — tabs now **Overview · Info · Intro · Story · Meditation · Article · Completed**. Removed `path.step_1.default_intro_quote` and `path.step_3.pre_meditation_lines` (a phantom that existed only in the CMS).
- **`daily.main`** — 58 → 45 keys in 7 sections in reel order. 9 fallbacks labelled; 12 dead + 1 misfiled removed.
- **`onboarding`** — welcome (Welcome / Buttons / Legal document screens / Errors), name, greeting, user_type (Question / Options / Button), carousel (three page sections), and `consent_modal` **relabelled "Marketing consent"** with the legal-audit warning in its description. Render-verified in the admin.
- **`daily.common`** — relabelled **"Errors & coming-soon messages"**; it is *not* a Daily screen but the shared error/snackbar pool for Home **and Profile**. 3 dead keys removed.
- **`daily.load_info`** — relabelled **"Daily — Load Messages"**. Only the two `*_random` keys actually render; the other four are prepared in code but shown nowhere — said so in their descriptions.
- **`explore.overview`** — three sections; **Learn cards reordered** to the real on-screen order (`card_who_is_title → card_talks_title → card_subtle_system_title → card_what_is_title`); `section_label` kept ungrouped since it renders once per section.
- **`auth`** — `common` (Sign-in buttons / Account-exists prompt / Errors), `login` (form + the two bottom sheets + errors, 1 dead removed), `restore_password`, `restore_password_email_sent`, `create_account` (landing screen / email form / errors / consent).
- **`navigation`**, **`general`** — described; order was already right.

**Method note:** order, sections and every dead claim were re-verified against the app source (not taken from the audit alone) by a per-leaf draft→adversarial-verify pass. That caught several audit errors — e.g. `something_went_wrong` is a generic error used in four places, not a Daily-load failure; `card_action_not_available` fires on a missing/invalid card destination, not an unbuilt feature.

## Open decisions — for a human, deliberately not acted on

1. **`auth.create_account` — six keys kept but apparently unused.** `error_email_in_use`, `login_with_existing_account`, `error_google_failed`, `error_apple_failed`, `error_facebook_failed`, `error_provider_cancelled`. Source shows zero usages: email collisions use the account-exists sheet, social failures surface through a shared interstitial dialog, cancellations are silent, and `login_with_existing_account`'s button is gated on `_showLoginWithExistingAccount` — a flag never set true. **Kept in place and flagged in their descriptions** (the handoff called this a product question, not a delete). Decide: drop the keys, or restore the paths that should show them.
2. **Variant copy not exposed.** `screen_title` / `screen_subtitle` / `skip_and_explore` have alternate wordings for the meditation-gate and onboarding-start entry points (`screen_title_gate`, `screen_title_onboarding_start`, `skip_explore_app`, …) that are **not in the CMS leaf**. Editing the CMS copy only affects the default entry point.
3. **`consent_label` has no app key.** en.yaml has no `consent_label`; in-app the line is assembled from four strings (`consent_prefix` + `consent_terms` + `consent_and_acknowledge` + `consent_privacy`). The CMS exposes one richText field instead.
4. **The richText render limitation** above — accept, or invest in inline rendering.

## CMS↔app contract breaks — no preview or IA can fix these

1. **`meditation.feedback` — the app hardcodes that copy.** All 8 keys map to a `path_meditation_feedback` section with **zero usages**; the screen hardcodes the strings (`meditation_feedback_form.dart:73,88,102,120`). **The CMS advertises 8 editable strings that do nothing in any locale.** Live bug.
2. **`meditation.reminder` — 0/34 keys align.** CMS uses `prompt_title`; the app stores the identical strings as `reminder_prompt_title` under `meditation.intent`. Needs a `keyPrefix` concept, not a remap.
3. **`profile.privacy` — 1/17 align.** CMS schema predates the app's `ads_*` rename.
4. **`daily.main.start_course` / `continue_course` are matched, not displayed** — compared against a card's button text to detect the action. Editing them changes behaviour. Currently flagged in their descriptions; the real fix is to stop matching on translatable copy.
5. **`path.step_1.author`** is hardcoded ("Shri Mataji Nirmala Devi") **under a per-lesson quote** — a different panel's quote still shows that author. `PathStep` has no author field.
6. **`step_4.media_card_*` are in the wrong namespace** — `ShriMatajiTalkCard` is driven by any CMS lecture-card block (`cms_constructor_content.dart:228`), not step 4. `LectureClip.speakerName` exists and is ignored.
7. **`navigation` has a hardcoded English fallback** (`app_bottom_navbar.dart:194`) — a missing translation silently reverts to English rather than showing the key.

## Run it

```bash
# CMS
docker start sahajcloud-pg          # Postgres lives here; Docker must be running
pnpm dev                            # or .claude/skills/dev-server/dev-server.sh
# admin: localhost:3000/admin/globals/wm-app-translations
# login: contact@sydevelopers.com / evk1VTH5dxz_nhg-mzk

# App preview (so the eye icon renders the real screen)
cd ~/Projects/WeMeditate/WeMeditateApp
fvm flutter build web -t lib/main_app_preview.dart --release --pwa-strategy=none
python3 -m http.server 5301 -d build/web
# SahajCloud/.env.local: WEMEDITATE_APP_URL=http://localhost:5301
#   (deployed instead: https://wm-app-preview.pages.dev — still serves an OLD bundle)
```

**Schema edits need a CMS restart** (the Payload config reads the JSON at boot). If the admin renders a stale component after an edit, the browser is caching a dead chunk — `rm -rf .next`, restart, and open a **fresh tab**; a reload alone will keep serving it.

**Stale local DB.** The shared `sahajcloud` DB drifts behind this branch, and Drizzle's `push` then blocks on interactive "created or renamed?" prompts that a non-interactive shell can't answer (`CI=true` and piped stdin don't help — it reads the TTY). Point `.env.local` at a **fresh** database instead (`DATABASE_URL=…/sahajcloud_ia`); an empty DB pushes cleanly with no prompts. First user: the Admin radio is disabled on the create-first-user form, so create as Manager then `UPDATE managers SET type='admin'`.

## Gotchas

- The formatter strips imports that are momentarily unused mid-edit. After editing `TranslationsRowField.tsx`, re-check its import block before trusting a typecheck.
- `.collapsible__toggle` reads "Toggle block" — the section name is in `.collapsible__header-wrap`. Don't assert on the wrong one.
- Verify against a **debug/dartdevc** app build when chasing a Flutter error: release minifies type names to gibberish (`minified:V9`).
- After changing the schema, run the reorder/apply scripts rather than hand-editing JSON — they report unhandled keys and sync the seed.
- The two seed shapes (flat vs `.strings` + richText siblings) are easy to corrupt by hand; go through `reorder-lib.mjs`.
