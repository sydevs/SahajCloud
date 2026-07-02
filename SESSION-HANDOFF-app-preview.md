# Handoff — WeMeditate App Preview in the CMS

**Updated:** 2026-07-03. Spans two repos: **SahajCloud** (Payload CMS) and **WeMeditateApp** (Flutter). Written to be picked up cold.

---

## 1. TL;DR — what's built and verified

The **real WeMeditate app runs on Flutter Web** and is embedded in the Payload CMS via Payload's **native Live Preview**. Editing a CMS doc renders that content's **actual app screen**, live. Where one slug maps to several screens, a **picker** in the preview switches between them.

**Verified with screenshots** (injection render + full CMS loop + live typing):

| CMS entity | Kind | App preview | Screens / variants | Mechanism |
|---|---|---|---|---|
| **Translations** (`wm-app-translations`) | global | Real onboarding/auth screens with the editor's copy overlaid | Welcome · Name · Greeting · User type · Login | **string-override** |
| **App Cards** (`app-cards`) | collection | Real home card | Hero · Highlight · Landscape | doc→model |
| **Path Steps** (`lessons`) | collection | Real Path Step screens | Intro · Story · Article | doc→model |
| **Pages** (`pages`) | collection | Page body via the app's content constructor | (single) | doc→model |
| **Meditations** (`meditations`) | collection | Real Meditation player (stubbed playback) | (single) | doc→model + fake cubit |
| **Lectures** (`lectures`) | collection | Real Shri Mataji Talks list | (single) | doc→model |
| **App Configuration** (`wm-app-config`) | global | Overview of what the config wires up | (single) | config-overview |

**The money shot:** in the translations editor, typing into a field updates the app screen **live** — verified end-to-end in the real admin (`temp_scripts/cms-live-edit.mjs`).

Unmapped slugs fall back to an honest **live doc summary**. `wm-app-status` is intentionally **not** wired — it's a CMS-only launch-readiness dashboard the app never consumes (see §7).

---

## 2. Architecture — "the app IS the preview engine"

```
CMS doc edit ──(Payload native live preview, postMessage)──▶ hosted Flutter web app
  admin.livePreview.url = WEMEDITATE_APP_URL/?collection|global=<slug>&id&locale&secret
                                            │
   app boots web-safe (skips Firebase init/Crashlytics/audio_service) → PreviewHost
                                            │
   PreviewHost reads target + receives the streamed doc → previewRegistry[slug]
                                            │
   builder maps the doc through the app's OWN fromJson → the REAL screen widget
```

Three mapping mechanisms, one host:

- **doc→model** — map the edited doc through the app's own `fromJson` into the real screen (Lessons, Lectures, Meditations, App Cards, Pages).
- **string-override** — rebuild the app's `Strings` with the editor's CMS changes overlaid on the English base, render a real screen inside `Localizations.override` (Translations).
- **config-overview** — an app-styled summary of what a config global wires up (App Configuration).

- **CMS side is minimal + native**: just `admin.livePreview.url` (via `appLivePreview(slug, kind)`) + drafts where needed. No custom fields/components. (CTO priority — Payload stays vanilla.)
- **App side** carries all logic and reuses the app's real screens + mappers.
- Global cubits (Theme/Auth/UserState/…) are provided at the root in default states; the bootstrap never calls their network/Firebase methods.

---

## 3. Repos, branches, commits

**WeMeditateApp** — branch **`feat/cms-preview-engine`** (off app `main`). ⚠️ The app repo's dev workflow **cleans uncommitted changes**, so all preview code is committed. Commits (newest first):
- `72b49d83` wm-app-config overview · `08a89caa` pages · `eaa0ffc3` translations · `78e8b5fe` multi-variant host + app-cards + path-step variants · `1418de15` meditations · `0ee999ac` lectures · `d1d1741d` lessons · `1bddc0d4` engine
- Key files: `lib/main_app_preview.dart` (web entry), `lib/preview/{live_preview_client,preview_host,preview_registry,translation_preview}.dart`, `lib/preview/fakes/preview_meditation_player_cubit.dart`, `assets/l10n/en_preview.json` (translation base), `web/` (Flutter web scaffold).

**SahajCloud** — branch **`claude/nice-shtern-4fa2c0`** (rebased on `main`; backup `backup/nice-shtern-pre-rebase`). Commits:
- `7b6b986` regenerate payload-types (Lessons/Lectures `_status`)
- `c47bd8d` wm-app-config live preview · `1d1d8b2` translations → app engine · `858b0cb` app-cards live preview · `4384455` Lessons/Lectures/Meditations live preview + drafts · `5e1f38a` (earlier) translations native live preview
- Files: `src/lib/preview/appLivePreview.ts` (collection + global helper), `src/collections/{Lessons,Lectures,Meditations,AppCards}/…`, `src/globals/{WeMeditateAppTranslations,WeMeditateAppConfig}/…`.
- **Uncommitted / untracked:** `.claude/launch.json`, `temp_scripts/`, this file.
- Local-only branch (a clean PR is expected when finalized).

---

## 4. Run it locally (servers die between sessions — full restart)

Prereqs: Docker running; fvm Flutter 3.35.4; `node_modules` in the worktree (`CI=true pnpm install`).

1. **Postgres**: `docker start sahajcloud-pg` (exists) — or create: `docker run -d --name sahajcloud-pg -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=sahajcloud -p 5432:5432 postgres:16` then `CI=true pnpm db:migrate`. `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sahajcloud`.
2. **CMS** (`:3000`): `CI=true pnpm dev` from the worktree. `.env.local` sets `WEMEDITATE_APP_URL=http://localhost:5300`. Admin `localhost:3000/admin`; dev autoLogin as **contact@sydevelopers.com / evk1VTH5dxz_nhg-mzk**.
3. **App** (`:5300`): from WeMeditateApp on `feat/cms-preview-engine`: `fvm flutter run -d web-server --web-port 5300 -t lib/main_app_preview.dart` (first compile ~15–20 s).
4. **See it:** `localhost:3000/admin` → **Translations** (or App Cards / Path Steps / …) → **eye icon** → edit a field, watch the app update live. Use the in-preview picker to switch screens.

`.claude/launch.json` registers both servers. **Gotcha:** a collection/global *config* change (livePreview/drafts) needs a **cold** CMS restart (`rm -rf .next` then restart) — the toggler is client-config-driven.

---

## 5. Add a preview (repeatable patterns)

**CMS (always):** `admin.livePreview: appLivePreview('<slug>')` for a collection, or `appLivePreview('<slug>', 'global')` for a global. Collections that surface the toggler on the create page also need `versions.drafts.autosave`. Globals need only `livePreview`. Cold-restart the CMS.

**App — pick the mechanism** in `lib/preview/preview_registry.dart`:

- **doc→model** — `PreviewEntry`/`PreviewVariant` whose `build` maps `doc` via the app's own `fromJson` into the real screen. If the screen builds its own cubit via `getIt` with no preload seam, register a seeded fake (`getIt.allowReassignment = true; getIt.registerFactory<XCubit>(() => _Fake(...))` — see `preview_meditation_player_cubit.dart`).
- **string-override** (translations) — add a `TranslationScreenSpec` in `lib/preview/translation_preview.dart` (`label`, `appPath`, `cmsPath`, `buildScreen`). The helper overlays the CMS leaf onto the English base and wraps the screen in `Localizations.override`.
- **config-overview** — render an app-styled summary from the doc's fields (see `_appConfigOverview`).

Restart the app to recompile (`-d web-server` doesn't hot-reload on file change).

---

## 6. Verify (do it — don't claim blind; the user is strict)

- **Isolated render:** `node temp_scripts/inject-render.mjs <slug> [global]` — boots the app, injects a sample doc via postMessage, screenshots `/tmp/wm-playwright/inject-<slug>.png` (+ `-v2/-v3` after clicking picker chips). Sample docs live in the script's `docs` map.
- **Full CMS loop:** `node temp_scripts/cms-loop.mjs <adminPath> <label>` — opens the doc/global in the real admin, opens the preview, screenshots the split view. e.g. `globals/wm-app-translations translations`, `collections/app-cards/create app-cards`.
- **Live editing:** `node temp_scripts/cms-live-edit.mjs` — types into the translations Title field and screenshots the app updating live.
- `fvm flutter analyze lib/preview` (2–3 s) catches Dart errors before an 18 s rebuild.

---

## 7. Done / not done

- ✅ **Translations, App Cards, Path Steps, Pages, Meditations, Lectures, App Configuration** → previews above, all verified.
- ⏳ **Translations — more screens.** Wired: welcome/name/greeting/user_type/**login**. The overlay **deep-merges** nested sections, so a screen reading several sub-sections works (Login overlays `auth.login`+`auth.common`). Remaining easy adds: create-account (needs `entryContext`), restore-password, profile contact. Profile main/account/history need a seeded cubit (user-state driven). Each needs CMS↔app key alignment checked (mostly 1:1; watch richText-vs-split-string keys, e.g. welcome `legal_disclaimer`, user_type `title`).
- ⏳ **Pages — CMS trigger.** The app renderer is built + verified, but the `pages` collection still points its `livePreview` at the **web frontend** (a live deployed worker). Flipping it to the app is one line but is a product decision (§9).
- ⛔ **`wm-app-status`** — intentionally skipped. It's a CMS-only launch-readiness dashboard; the app never fetches it. Its force-update gate is Firebase Remote Config, unrelated.
- Embedded/media-only collections (Songs/Albums/Videos/Frames/Images/Files/Narrators/Authors/Audiences/Regions/Events) have no standalone app screen — correctly unmapped.

---

## 8. Key findings & gotchas (hard-won)

- The **whole app compiles + boots on Flutter Web**. Global cubits touch Firebase via **lazy getters**, so they construct native-safe. No eager DI singletons.
- **Background refreshes hit prod** (`cloud.sydevelopers.com`) and fail Firebase attribution on web. Screens that render from the injected/preloaded doc **swallow** this (Lessons, Lectures). Path Step 4 emits an error state only when it has *no* initial content — supply a real `article` and it keeps the preloaded content.
- **Live-preview form state shapes:** array fields arrive as a **row count (int)**, relationships as an **id or `{value}` map**. Config-overview code must be defensive (`is List ? … : is int ? …`).
- **Translations key divergence:** the CMS groups strings differently from the app's `Strings` tree. `en_preview.json` (generated from `assets/l10n/en.yaml` + a synthetic `meta: {}`) is the base; each screen spec declares `appPath`/`cmsPath`. Only matching string keys override, so partial edits never blank a screen. `Strings.fromJson` requires **all** sections present — hence the full base.
- **Globals need only `livePreview`** to surface the toggler; **collections** need `drafts.autosave` (autosave creates a draft on the create page).
- **eslint auto-fix strips a just-added import** if its usage isn't in the same edit — add the import and its usage together.
- **`-d web-server` doesn't hot-reload**; **config changes need a cold CMS restart** (`rm -rf .next`).
- First browser load of a fresh app server **compiles** the bundle — an early "Failed to initialize" just means the compile hadn't finished; re-run.

---

## 9. Flags / decisions to review (need product input)

1. **Pages preview target** — `pages` currently previews on the **web frontend**. App editors also edit pages; flipping to the app (`appLivePreview('pages')`) gives an app preview but **loses the web preview** (one `livePreview` slot). Recommend deciding per audience, or adding an app-preview link field alongside web.
2. **Prod migration** — drafts were enabled on **Lessons + Lectures** and autosave on **App Cards** (locally auto-synced via `push`); prod needs a **migration**. **Meditations `livePreview` was repointed** from the web frontend to the app.
3. **Deploy target for the web app** — the app fetches CMS content with an API key; don't embed it in a public page. Cloudflare Pages/Worker + Access (gated URL) is the natural fit, decoupled from the mobile release train.
4. Diverges from the CTO's original "hosted page reimplementing `useLivePreview`" — it's a **superset** (whole app, all collections) but keeps the **Payload side minimal**. Worth his explicit nod.

---

## 10. Next steps (priority order)

1. **Decide Pages preview target** (§9.1) and the **deploy/gating** (§9.3).
2. **Expand translations** to Auth + Profile screens (§7) — same pattern, high value.
3. **Create the prod migration** for the drafts/autosave/repoint changes (§9.2).
4. **Clean PRs** — app `feat/cms-preview-engine`; a fresh SahajCloud PR off `claude/nice-shtern-4fa2c0`.
5. Optional: enrich the meditation preview with image frames; richer Pages block coverage.
