# Handoff — WeMeditate App Preview in the CMS

**Updated:** 2026-07-03. Spans two repos — **SahajCloud** (Payload CMS) and
**WeMeditateApp** (Flutter). Written to be picked up cold. For the production
deploy steps see the companion **[DEPLOY-PREVIEW.md](DEPLOY-PREVIEW.md)**.

---

## 0. TL;DR

The **real WeMeditate app runs on Flutter Web** and is embedded in the CMS via
Payload's **native Live Preview**. When an editor/translator edits a doc, the app
renders that content's **actual app screen**, live. Built + verified:

- **7 translation screens** driven by the `wm-app-translations` global (Welcome,
  Name, Greeting, User type, Login, Explore, Contact) — real copy overlaid as you
  type; the **CMS tab bar switches the previewed screen**.
- **6 content collections/globals** render their real screen (Path Steps,
  Lectures, Meditations, App Cards, Pages, App Configuration).
- **Translator-editor UX** in the CMS: input placeholder shows the English
  reference, inputs grow to fit the whole text, 526 field descriptions rewritten
  plain-language.
- **Production web build is proven** (compiles clean + renders a streamed edit).

**What ships to translators = deploy the hosted app + one prod env var.** They
need nothing local. See §11 / DEPLOY-PREVIEW.md.

---

## 1. How it works for a translator (the product)

A translator opens **prod** `cloud.sydevelopers.com/admin` → Translations → the
eye icon. The preview pane is an `<iframe>` pointing at a **hosted build of the
app**. As they type, the prod CMS streams the edited doc to that iframe over
`postMessage` (cross-origin-safe — **no CORS, no API key, no data fetch**), and
the app re-renders the screen with their copy. The English base is bundled inside
the app (`assets/l10n/en_preview.json`); their edits overlay it.

The translation screens are **pure text**, so this is the whole story for them —
no local setup, no server, no data pull.

---

## 2. Architecture — "the app IS the preview engine"

```
CMS doc edit ──(Payload native live preview, postMessage)──▶ hosted Flutter web app
  admin.livePreview.url = WEMEDITATE_APP_URL/?collection|global=<slug>&id&locale&secret
                                            │
   app boots web-safe (skips Firebase/Crashlytics/audio_service) → PreviewHost
                                            │
   PreviewHost reads target + receives the streamed doc → previewRegistry[slug]
                                            │
   builder maps the doc through the app's OWN mapper → the REAL screen widget
```

Three mapping mechanisms behind one host:

- **doc→model** — map the edited doc through the app's own `fromJson` into the
  real screen (Lessons, Lectures, Meditations, App Cards, Pages).
- **string-override** — rebuild the app's `Strings` with the editor's CMS changes
  overlaid on the English base, render a real screen inside `Localizations.override`
  (Translations).
- **config-overview** — an app-styled summary of what a config global wires up
  (App Configuration).

**Multi-variant host.** A slug can expose several screens; the host renders a
picker to switch (Lessons → Intro/Story/Article; App Cards → Hero/Highlight/
Landscape; Translations → the 7 screens).

**Tab-follow.** For translations, a `ScreenBeacon` UI field in the CMS posts the
active tab's `screenId`; the app follows it to the mapped screen (see §5).

**CMS side stays vanilla** — just `admin.livePreview.url` via `appLivePreview()`
+ drafts. No custom Payload internals touched (the CTO's priority). The custom
admin components we DO have (`ScreenBeacon`, `TranslationsRow`) are our own field
components, not Payload core.

---

## 3. Repos, branches, commits

**WeMeditateApp** — branch **`feat/cms-preview-engine`** (off app `main`).
⚠️ The app repo's dev workflow **cleans uncommitted changes**, so all preview code
is committed here. 12 commits `1bddc0d4 … 96b42e7f`. Files:
- `lib/main_app_preview.dart` — web entry (web-safe boot + PreviewHost)
- `lib/preview/live_preview_client.dart` — Payload live-preview + beacon client
- `lib/preview/preview_host.dart` — host: phone frame, picker, unmapped notice
- `lib/preview/preview_registry.dart` — per-slug builders (all collections)
- `lib/preview/translation_preview.dart` — string-override + the 7 screen specs
- `lib/preview/fakes/preview_meditation_player_cubit.dart` — seeded player cubit
- `assets/l10n/en_preview.json` — English base for the overlay (from en.yaml)
- `web/` — Flutter web scaffold

**SahajCloud** — branch **`claude/nice-shtern-4fa2c0`** (rebased on `main`;
backup `backup/nice-shtern-pre-rebase`). Preview commits `5e1f38a … 568b7cf`.
Files:
- `src/lib/preview/appLivePreview.ts` — the `livePreview.url` helper (collection + global)
- `src/collections/{Lessons,Lectures,Meditations,AppCards}/…` — `livePreview` + drafts
- `src/globals/{WeMeditateAppTranslations,WeMeditateAppConfig}/…` — `livePreview`
- `src/globals/WeMeditateAppTranslations/translationsSchema.json` — 526 simplified descriptions
- `src/components/admin/ScreenBeacon/ScreenBeacon.tsx` — tab-follow beacon
- `src/components/admin/TranslationsRow/{TranslationsRowField,AutoGrowTextarea}.tsx`, `styles.css` — editor UX
- `src/fields/translationsField.ts` — builds the tabs + emits the beacon per leaf
- `DEPLOY-PREVIEW.md`, this file
- **Uncommitted:** `src/payload-types.ts` (run `pnpm generate:types` + commit before the PR). Untracked: `.claude/launch.json`, `temp_scripts/`, `.env.local`.

---

## 4. Coverage matrix

| CMS entity | Kind | App preview | Screens / variants | Mechanism | Verified |
|---|---|---|---|---|---|
| **Translations** `wm-app-translations` | global | onboarding/auth/explore/profile screens | Welcome · Name · Greeting · User type · Login · Explore · Contact | string-override | ✅ full CMS loop + live typing + tab-follow |
| **App Cards** `app-cards` | collection | home card | Hero · Highlight · Landscape | doc→model | ✅ full loop + render |
| **Path Steps** `lessons` | collection | Path Step screens | Intro · Story · Article | doc→model | ✅ render |
| **Meditations** `meditations` | collection | Meditation player (stubbed playback) | — | doc→model + fake cubit | ✅ render |
| **Lectures** `lectures` | collection | Shri Mataji Talks list | — | doc→model | ✅ render |
| **Pages** `pages` | collection | page body via CmsConstructorContent | — | doc→model | ✅ render |
| **App Configuration** `wm-app-config` | global | config overview | — | config-overview | ✅ full loop |

`wm-app-status` is intentionally **not** wired — it's a CMS-only launch-readiness
dashboard the app never consumes. Embedded/media-only collections
(Songs/Albums/Videos/Frames/Images/Files/Narrators/Authors/Audiences/Regions/
Events) have no standalone app screen — correctly unmapped.

**Still show the "no screen yet" notice** (data-driven, need §12 work): Daily/Home,
full Path, Meditation flow, and most of Profile.

---

## 5. Translations deep-dive (the linchpin)

**Mechanism.** The app uses `easiest_localization`; every string resolves through
`context.el` → `Localizations.of(context, Strings)`. To preview an edit we build
an override `Strings` and wrap the screen in `Localizations.override`:
1. `assets/l10n/en_preview.json` (generated from `assets/l10n/en.yaml` + a
   synthetic `meta:{}`) is the complete English base — `Strings.fromJson` requires
   **all** sections present.
2. Deep-merge the CMS leaf onto the matching base section (`_deepOverlay` in
   `translation_preview.dart`), then `Strings.fromJson(merged)`.
3. Render the real screen under that override.

**CMS↔app key divergence (the main hazard).** The CMS tabs group strings
differently from the app's `Strings` tree, so each screen declares BOTH paths:
`TranslationScreenSpec{ appPath, cmsPath, screenIds, buildScreen }`. Known maps
that are NOT identity: CMS `onboarding.welcome` → app **`welcome`** (top-level);
CMS `explore.overview` → app **`home.explore`**; CMS `onboarding.consent_modal` →
app `onboarding.marketing_consent`; CMS `explore.talks_*` → app `talks.*`; CMS
`daily.*` → app `home.*`; CMS `path.*` → app flattened `path`/`path_step_1…4`.
Within a mapped section, keys are mostly 1:1 (auth, profile.contact, explore.overview
verified identical). richText-vs-split-string keys (welcome `legal_disclaimer`,
user_type `title`) diverge — left at the English default.

**Reset-to-English on delete.** `_deepOverlay` overlays only **non-empty** strings,
so clearing a field falls back to the English base — matching the app's locale
fallback (verified: empty title → "Welcome, friend").

**Tab-follow (ScreenBeacon).** `createScreenBeaconField` in `translationsField.ts`
emits an invisible `ui` field per leaf; `ScreenBeacon.tsx` posts
`{type:'wm-active-screen', screen:'onboarding.welcome'}` to the preview iframe
(selector matches `iframe[src*="wm-app-translations"]`). The app
(`listenForActiveScreen`) maps `screenId` → the spec's `screenIds` and switches;
unmapped tabs show a clean "no app screen yet" notice so **every tab visibly
responds**.

**Adding a translation screen:** add a `TranslationScreenSpec` (screen must be
copy-first, ideally no cubit — `const XScreen()`), check its CMS↔app key
alignment, list its `screenIds`. Restart the app.

---

## 6. Translator editor UX (in the CMS)

- **Placeholder shows the English** — `TranslationsRowField.tsx`: when translating
  a non-English locale, the input reads `Enter translation — "…english…"`.
- **Inputs grow to fit** — `AutoGrowTextarea.tsx` measures the placeholder/value
  (temporarily writing it, reading `scrollHeight` + border) and re-measures on
  width changes (`ResizeObserver`), so multi-line hints aren't clipped. The CSS
  fix was removing `flex: 1` from the textarea (it was stretching to the grid-row
  and overriding the measured height — see `styles.css`).
- **Simpler descriptions** — all **526** `description`s in `translationsSchema.json`
  rewritten short + plain (avg 77→41 chars, jargon/code-refs stripped). Regenerate
  from source only if the schema keys change; the mapping was one-shot.

---

## 7. Preview host internals

`preview_host.dart`:
- `_PhoneFrame` — a 390×844 device, `FittedBox`-scaled to fit the iframe. Wrapped
  in `Material` (fixes Flutter's "no Material" yellow-underline on chrome text).
- `_VariantPicker` / `_PickerChip` — single centered row that scrolls
  horizontally (never wraps to a 2nd row); shown only when a slug has >1 variant.
- `_UnmappedScreenNotice` — the "no app screen yet" card for beacon-driven tabs
  with no wired screen.
- Payload has **no default-breakpoint config** (`useState('responsive')` is
  hardcoded), so the default is Responsive; the app draws its own phone so it
  still looks like a device. Editors can pick "Mobile" or drag the pane divider.

---

## 8. Run it locally (dev — servers die between sessions)

Prereqs: Docker; fvm Flutter 3.35.4; `node_modules` (`CI=true pnpm install`).
1. **Postgres**: `docker start sahajcloud-pg` (or create + `CI=true pnpm db:migrate`).
   `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sahajcloud`.
2. **CMS** (`:3000`): `CI=true pnpm dev`. `.env.local` → `WEMEDITATE_APP_URL=http://localhost:5300`.
   Admin autologin **contact@sydevelopers.com / evk1VTH5dxz_nhg-mzk** (local only).
3. **App** (`:5300`): from WeMeditateApp on `feat/cms-preview-engine`:
   `fvm flutter run -d web-server --web-port 5300 -t lib/main_app_preview.dart`.
4. `.claude/launch.json` registers both. **Cold-restart the CMS** (`rm -rf .next`)
   after any collection/global `livePreview`/drafts change — it's client-config-driven.

To see real prod English locally: `node temp_scripts/pull-translations.mjs`
(reads prod's translations global via the app's API key server-side → seeds local;
read-only on prod). Prod is English-only for this global.

---

## 9. Add a preview (patterns)

**CMS:** `admin.livePreview = appLivePreview('<slug>')` (collection) or
`appLivePreview('<slug>','global')` (global). Collections need
`versions.drafts.autosave` to surface the toggler on the create page; globals need
only `livePreview`. Cold-restart the CMS.

**App** (`preview_registry.dart`): a `PreviewEntry` with one or more
`PreviewVariant`s whose `build` maps the doc via the app's own `fromJson`. If the
screen builds its own cubit via `getIt` with no preload seam, register a seeded
fake (`getIt.allowReassignment = true; getIt.registerFactory<XCubit>(() => _Fake())`
— see `preview_meditation_player_cubit.dart`). Restart the app.

---

## 10. Verify (do it — the user is strict about this)

`temp_scripts/` (scratch, not committed — review before keeping):
- `inject-render.mjs <slug> [global]` — boots the app, injects a sample doc,
  screenshots the real screen (+ `-v2/-v3` after clicking picker chips).
- `cms-loop.mjs <adminPath> <label>` — full loop in the real admin (open, toggle
  preview, screenshot the split view).
- `cms-live-edit.mjs` — types into a field, screenshots the app updating live.
- `tab-follow.mjs` — clicks the CMS tabs, verifies the preview follows.
- `pull-translations.mjs` / `seed-english.mjs` — seed local from prod / app English.
- `prod-build-smoke.mjs` — serves `build/web` + streams an edit (release-build check).
- `fvm flutter analyze lib/preview` (2–3 s) before an ~18 s rebuild.

---

## 11. Production deployment

See **[DEPLOY-PREVIEW.md](DEPLOY-PREVIEW.md)**. In short — **Phase 1** (the
translation preview, all a translator needs):
1. `fvm flutter build web -t lib/main_app_preview.dart --release` → `build/web/`
   (**verified**: compiles clean + renders a streamed edit).
2. Host `build/web/` behind access control (Cloudflare Pages + Access). No secrets
   in the bundle for Phase 1.
3. Set prod `WEMEDITATE_APP_URL` = the hosted URL. `next.config.mjs` builds the CSP
   `frame-src` from it automatically (no code change); redeploy the CMS.
4. Merge + deploy the CMS branch; create the Payload migration for the drafts/
   autosave/repoint schema changes (§14).

---

## 12. The prod-data investigation (what we learned)

The **data-driven** screens (Daily/Path/Meditation, "see all app cards") render
real content. Findings:
- The preview app already points at prod (`baseUrl = cloud.sydevelopers.com`) and
  the API key (in the app's `.env.local.json`, header `clients API-Key`)
  **authenticates server-side** (200s).
- But a **browser** build is blocked by **CORS** — prod doesn't allow the preview
  origin. The native app isn't; the web build is. So the web preview **cannot
  fetch prod live** without prod CORS allowing the preview origin.
- Attribution: the app's `attributedHeaders()` throws `PayloadCmsUserAttributionException`
  without a Firebase user; the debug-only seam `PayloadCmsConfig.debugUserIdOverride`
  bypasses it (works in `flutter run`/debug, **stripped in release** — so not a
  deploy solution).
- **Text screens need none of this** — their copy arrives via the postMessage
  stream. So for Phase 2 only: allow the preview origin in prod Payload `cors`,
  serve reads through a GET-only proxy or scoped key (don't embed the key), and do
  the screen-instantiation work (Daily/Home/full-Path run inside the app router +
  cubits).

---

## 13. Key findings & gotchas (hard-won)

- **Whole app compiles + boots + release-builds on Flutter Web.** Global cubits
  touch Firebase via lazy getters → construct native-safe. No eager DI singletons.
- **postMessage is the transport** for text screens — cross-origin-safe, so the
  hosted preview needs no prod API access for translations.
- **eslint auto-fix strips a just-added import** if its usage isn't in the SAME
  edit — add import + usage together (bit `appLivePreview`, `useCallback`).
- **Flex vs measured height** — a textarea with `flex:1` in a stretched flex cell
  ignores an inline `height`; remove flex-grow so the autosize wins.
- **Flutter "no Material" yellow underline** — chrome text needs a `Material`
  ancestor.
- **Cold CMS restart** (`rm -rf .next`) for any `livePreview`/drafts/schema-desc
  change; `-d web-server` never hot-reloads on file change (restart to recompile).
- **First browser load of a fresh app server compiles** — an early "Failed to
  initialize" just means the compile wasn't done; re-run.
- **Live-preview form state shapes**: array fields arrive as a **row count (int)**,
  relationships as an **id or `{value}` map** — config-overview code is defensive.
- **Globals need only `livePreview`** for the toggler; **collections** need
  `drafts.autosave`.
- **Background refreshes hit prod + fail** (CORS/Firebase) and are swallowed;
  Path Step 4 emits an error state only when it has NO initial content (supply a
  real `article`).

---

## 14. Open decisions

- **Pages preview target** — `pages` still previews on the **web frontend**
  (`WEMEDITATE_WEB_URL`); the app renderer is built but not wired, since Payload
  allows one `livePreview` slot. Web-vs-app is a product call.
- **Prod migration** — drafts on Lessons/Lectures, autosave on App Cards, and
  **Meditations `livePreview` repointed** web→app. Create + commit a migration.
- **Hosting** for the preview page (Cloudflare Pages + Access recommended).
- **Phase 2** — data-driven screens: CORS + gated reads + instantiation.
- **payload-types.ts** — regenerate + commit before opening the PR.

---

## 15. Not done / next steps (priority)

1. **Deploy Phase 1** — host the build, set `WEMEDITATE_APP_URL`, ship the CMS
   branch + migration (DEPLOY-PREVIEW.md). Gets translators the live text preview.
2. **Decide Pages** target + open the clean SahajCloud PR.
3. **Phase 2** — CORS + read proxy + wire Daily/Path/Meditation (+ optional mock
   signed-in state for Profile screens — a stubbed `AuthAuthenticated` scoped to
   `main_app_preview.dart`, no Firebase).
4. Expand translation screens (create-account, restore-password, more onboarding)
   — same `TranslationScreenSpec` pattern.
