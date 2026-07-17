# Handoff — `wm-app-translations` information architecture

**Updated:** 2026-07-17 · **Branch:** `claude/nice-shtern-4fa2c0` (SahajCloud), rebased on `origin/main` (`a1a7e33`).
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

## Done

| Commit | |
|---|---|
| `764f1cc` | Path: dropped dynamic content, relabelled sections off "Step N" |
| `09ddcd8` | Section mechanism (Collapsible) + `daily.main` fully reordered/sectioned |

- **`path`** — tabs now **Overview · Info · Intro · Story · Meditation · Article · Completed** (was "Step 1..4 / Step Complete", which read as the Path's own steps rather than sections *within* one step). Leaf descriptions reworded. App side matches: `preview_host.dart` maps beacon ids to the same labels.
  - Removed `path.step_1.default_intro_quote` (the real quote is the step's first story panel; the app calls the hardcoded stand-in "the reported 'wrong quote then it changes' bug", `path_step_1_page.dart:280-283`) and `path.step_3.pre_meditation_lines` (a **phantom** — existed only in the CMS; the app reads `PathStep.preMeditationLines` from Lessons).
- **`daily.main`** — 58 keys → 45, in 7 sections in reel order: **Daily hero → Path promo → Learn from the source → What's your priority today? → Meditate with others → Card chrome → Button matching**. Verified against `daily_tab.dart` (reel slivers `:936-977`, long panel `:1624-1661`).
  - 9 fallbacks now labelled. 12 dead keys + 1 misfiled (`learn_from_source` renders on the Check Vibes talk screen) removed. Seed kept in step.

## Remaining work — the audit is done, the authoring is not

Order/sections/flags below are **verified against the app**; applying them is mechanical (copy the shape of `temp_scripts/reorder-daily-main.mjs` — it prints anything unaccounted for rather than dropping it silently, and syncs the seed).

### `welcome`
`title`, `subtitle` → **Welcome** · `legal_disclaimer_prefix`, `legal_terms`, `legal_disclaimer_and`, `legal_privacy_policy` → **Legal disclaimer** (note: renders **above** the buttons, `welcome_screen.dart:178` before `:182`) · `get_started`, `use_existing_account` → **Buttons** · `privacy_policy_title`, `terms_and_conditions_title` → **Legal document screen** (the pushed screen) · `email_app_unavailable`, `link_open_failed` → **Errors** (EDGE).

### `onboarding`
- **`name`**: `title` → `placeholder` → `continue`.
- **`greeting`**: `message_prefix` only. The trailing `!` and the name are concatenated in code — no placeholder token.
- **`user_type`**: **Question** (`title_prefix`, `title_brand`, `title_suffix`) → **Options** (`option_complete_beginner`, `option_tried_before`, `option_attending_classes`, `option_yogi`) → **Button** (`get_started` — sits 5th in YAML but renders **last**).
- **`carousel`**: three pages, YAML order is correct — **Page 1 — A moment of peace** / **Page 2 — Get to know your true self** / **Page 3 — Unlock your potential**.
- **`marketing_consent`** (the leaf mistakenly called `consent_modal`): **Help spread the word** (`title` → `body_intro_before_link` → `what_we_share` → `body_intro_after_link` → `body_purpose` → `body_never_share_lead` → `body_never_share_middle` → `body_never_sell_lead` → `body_never_sell_tail`) → **Buttons** (`allow`, `reject`, `saving` EDGE) → **Errors** (`error` EDGE). `body_change_settings` is **DEAD**.
  - ⚠️ **Compliance:** keys 1-11 are snapshotted verbatim into the consent audit record (`ConsentScreenCopySnapshot`, `onboarding_marketing_consent_screen.dart:298-305`). Editing this copy has a legal-audit side effect, not just a display one. **Say so in the descriptions.**

### `home.common` — not a screen; a shared error/snackbar pool
All EDGE: `something_went_wrong`, `retry`, `card_action_not_available`, `external_link_coming_soon`, `music_coming_soon`. **DEAD:** `unlock_after_first_meditation`, `path_coming_soon`, `map_coming_soon`.

### `home.load_info` — not a screen; degraded-load banners on Daily
All six EDGE (`top_daily_unavailable/failed/random`, `quick_daily_unavailable/failed/random`), selected by `HomeLoadInfoType` (`home_cubit.dart:319-324`), rendered `daily_tab.dart:2494-2501`.

### `home.explore`
`section_label` renders **three times**, once per section (`explore_tab.dart:89`, `:186`, `:277`).
- **Meditate**: `section_meditate_title` → `card_daily_*` → `card_path_*` → `card_techniques_*` → `card_vibes_check_*` → `card_music_title` → `card_challenges_title`.
- **Learn** — **YAML order is wrong**. Real order: `card_who_is_title` → `card_talks_title` → `card_subtle_system_title` → `card_what_is_title`.
- **Join free classes**: `section_join_title` → `card_live_online_title` → `card_find_classes_title`.
- **Card states**: `card_coming_soon`.

### `auth` (7 sub-leaves)
- **`common`**: `or`, `continue_with_{google,apple,facebook,email}`, `cancel`; then **Errors** (EDGE): `error_enter_email`, `error_invalid_email`, `error_enter_password`, `error_password_min_length`, `error_password_needs_number`.
- **`login`**: **Log in** (`title` → `email_label` → `email_placeholder` → `password_label` → `password_placeholder` → `next` → `signing_in` EDGE → `forgot_password` → `continue_as_new_user`) → **Account-not-found sheet** (EDGE) → **Existing-provider sheet** (EDGE; `account_exists_subtitle` contains **`{providers}` — the token must survive translation**; `account_exists_existing_provider_fallback` is its FALLBACK) → **Errors** (EDGE). `error_cannot_continue_with_email` is **DEAD**.
- **`login_chooser`**: `title` → `subtitle` → `use_password`.
- **`restore_password`**, **`restore_password_email_sent`**: small; order = YAML (not line-verified).
- **`create_account`**: **Create account** (three mutually-exclusive `screen_title*` variants, three `skip_*` variants — only one of each ever renders) → **Email form** → **Account-exists sheet** (EDGE) → **Errors**. **DEAD cluster:** `error_email_in_use`, `error_google_failed`, `error_apple_failed`, `error_facebook_failed`, `error_provider_cancelled` — five provider errors with zero usages. Suspicious as a group: the provider-failure path likely falls through to `error_generic`. **Product question, not a delete.**
- **`interstitial`**: **Working** → **Outcome** (`welcome_back` contains `{name}`; `welcome_back_no_name` is its FALLBACK) → **Errors** (EDGE).

### `navigation`
`daily` → `path` → `explore` → `profile`. YAML order already correct. Note `app_bottom_navbar.dart:194` has a **hardcoded English fallback** — a broken translation silently reverts to English.

## CMS↔app contract breaks — no preview or IA can fix these

1. **`meditation.feedback` — the app hardcodes that copy.** All 8 keys map to a `path_meditation_feedback` section with **zero usages**; the screen hardcodes the strings (`meditation_feedback_form.dart:73,88,102,120`). **The CMS advertises 8 editable strings that do nothing in any locale.** Live bug.
2. **`meditation.reminder` — 0/34 keys align.** CMS uses `prompt_title`; the app stores the identical strings as `reminder_prompt_title` under `meditation.intent`. Needs a `keyPrefix` concept, not a remap.
3. **`profile.privacy` — 1/17 align.** CMS schema predates the app's `ads_*` rename.
4. **`daily.main.start_course` / `continue_course` are matched, not displayed** — compared against a card's button text to detect the action. Editing them changes behaviour. Currently flagged in their descriptions; the real fix is to stop matching on translatable copy.
5. **`path.step_1.author`** is hardcoded ("Shri Mataji Nirmala Devi") **under a per-lesson quote** — a different panel's quote still shows that author. `PathStep` has no author field.
6. **`step_4.media_card_*` are in the wrong namespace** — `ShriMatajiTalkCard` is driven by any CMS lecture-card block (`cms_constructor_content.dart:228`), not step 4. `LectureClip.speakerName` exists and is ignored.

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

## Gotchas

- The formatter strips imports that are momentarily unused mid-edit. After editing `TranslationsRowField.tsx`, re-check its import block before trusting a typecheck.
- `.collapsible__toggle` reads "Toggle block" — the section name is in `.collapsible__header-wrap`. Don't assert on the wrong one.
- Verify against a **debug/dartdevc** app build when chasing a Flutter error: release minifies type names to gibberish (`minified:V9`).
- After changing the schema, run the reorder script rather than hand-editing JSON — it reports unhandled keys and syncs the seed.
