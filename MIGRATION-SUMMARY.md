# Migration summary: Ideal implementation (M1–M6)

This document compares the Invert Userscripts Chrome extension **before** the in-repo strangler migration (guided by [`docs/IDEAL-IMPLEMENTATION.md`](./docs/IDEAL-IMPLEMENTATION.md) and executed via [`docs/IMPLEMENTATION-PLAN.md`](./docs/IMPLEMENTATION-PLAN.md)) with the **current** state after milestones **M1–M6**.

**Strategy used:** evolve in place — same Chrome sync storage, same MV3 package names (`shared` / `runtime` / `renderer` / `monaco`), no greenfield rewrite and no Vite migration.

**Product docs:** behavior after migration is described in [`docs/FEATURES.md`](./docs/FEATURES.md) (root [`FEATURES.md`](./FEATURES.md) points there).

---

## Snapshot

| Area | Pre-migration | After M1–M6 |
| ---- | ------------- | ----------- |
| Tab apply | Often all tabs (`tabs.query({})` / blunt refresh) | Matching tabs only; typed `applyScripts` / `setEnabled` |
| CSS re-apply | Insert-only → stacking | Bookmarks + `removeCSS` then insert; identical re-apply is a no-op |
| Toggle | Persist `enabled`; wait for nav/save to feel applied | Immediate apply/remove on matching open tabs |
| Live preview | Transpile on (near) every keystroke | 400ms debounce, cancelable; skipped when drawer collapsed |
| Monaco models | Eager for (nearly) all scripts | Active script + shared-dep closure (+ dirty drafts) |
| Dirty / conflict | Mirrored `status`; keep-local cleared conflict only | Draft dirty derived; keep-local persists to sync |
| UI layout state | `GlobalStateContext` + Redux split | Single Redux `ui` slice (+ `GlobalStateManager` persistence) |
| Hydrate helpers | Triplicate normalize/merge | Shared `userscript-hydrate` API |
| Thunks | God-file `thunks.userscripts.ts` | Split by use case; compile-free `load` for popup |
| Popup | Shared full IDE store → pulled compile graph | Dedicated popup store (load + toggle) |
| Editor drawer | JS output first, often expanded | Problems first, collapsed by default |
| `runAt` | Runtime/export only | Editable in script ⋯ menu |
| Pattern tester | History button without permission | Manual URL + open tabs only |
| Apply feedback | Silent | Toasts with matching-tab counts |
| Tooling | Manifest version could drift; no CI gate | Version stamped from `package.json`; `check:manifest` + GitHub Actions CI |

---

## Architecture changes

### What stayed the same

Package layout was **not** renamed into the vision’s ideal `domain` / `compile` / `inject` / `ide` split. The existing boundaries remain:

```text
packages/
  shared/     # models, storage, messages, match, hydrate, compile metadata
  runtime/    # service worker, inject, badge
  renderer/   # options IDE + popup UI + Redux + sandbox clients
  monaco/     # Monaco/Shiki workspace helpers
```

Webpack remains the bundler (explicit M6 decision). Chrome sync continues to hold sources/settings; local storage holds compiled artifacts.

### What changed under those packages

#### Injection (runtime + messages)

**Before**

- Options/popup often triggered a global refresh that walked open tabs broadly.
- CSS was inserted without a reliable remove/replace path.
- Enable/disable mainly wrote storage; open tabs often needed navigation or a save-driven refresh to update.

**After (M1)**

- Typed messages: `applyScripts { scriptIds }`, `setEnabled { scriptId, enabled }` (`packages/shared/src/messages.ts`).
- `applyScriptsToMatchingTabs` / `removeScriptFromMatchingTabs` (`packages/runtime/src/ide/scripts.ts`).
- Affected-script expansion for shared modules (`packages/shared/src/apply-scope.ts`).
- CSS insertion bookmarks (`packages/runtime/src/ide/css-bookmarks.ts`) for replace semantics.
- Covered by Playwright injection specs (`e2e/tests/injection/apply.spec.ts`).

#### Editor performance (renderer + monaco)

**Before**

- Live JS preview competed with typing.
- Workspace tended to materialize Monaco models for many/all scripts at boot → cost and shared-import “red flash.”

**After (M2)**

- Preview debounced (~400ms), generation-cancelled, gated on drawer open.
- Lazy workspace: `resolveWorkspaceScriptClosure` (`packages/shared/src/workspace-closure.ts`) + `workspace-service` sync of active + deps (deps upserted before consumer).
- Deferred dispose / dirty-offscreen model retention to avoid “Model is disposed” on script switch.

#### State model (renderer store)

**Before**

- Triple-ish cache: Monaco ↔ `editorDrafts` ↔ `userscripts` (+ mirrored `status: modified|saved`).
- Layout/nav in React `GlobalStateContext`, domain in Redux.
- Conflict “Keep local” dismissed the conflict without writing draft buffers to sync.

**After (M3)**

- Dirty UI from `selectIsDraftDirty` (draft vs saved), not a mirrored entity `status` write path.
- Keep-local → `saveUserscriptDraft` (compile → sync → apply); keep-all bulk path; e2e in `draft-sync.spec.ts`.
- Slim drafts: ensure on select/mount, prune clean on switch, storage sync doesn’t invent drafts for untouched scripts.
- UI persistence moved to Redux `ui` slice + `UiBootstrap`; `global-state.context.tsx` removed.

#### Package / module seams (shared + renderer)

**Before**

- `normalizeUserscript` / `mergeCompiledCode` copied in runtime, userscripts thunks, and storage-sync.
- Compile metadata lived in sandbox `compiler.ts` while hydrate logic forked elsewhere.
- Popup imported the IDE store and therefore the compile pipeline.

**After (M4)**

- Single hydrate API: `packages/shared/src/userscript-hydrate.ts` (+ unit tests).
- Compile metadata: `packages/shared/src/compile-metadata.ts` (re-exported from sandbox compiler for IDE call sites).
- Shared-import resolution helpers: `packages/shared/src/resolve-shared-scripts.ts`.
- Userscripts thunks split: `thunks.load` / `.crud` / `.save` / `.compile` / `.import` (+ barrel).
- Popup: `popup-store.ts` registers load + toggle only; ScriptList selectors/hooks kept compile-free so `popup.js` does not pull `build-worker` / Sass.

Ideal layout envisioned a separate `packages/compile`. That was **not** created; compile **execution** stays in renderer sandbox/workers, with metadata and hydrate in `shared` (strangler compromise).

#### Tooling

**Before**

- `public/manifest.json` copied with description overlay only; version could diverge from `package.json`.
- No automated post-build asset/budget gate; no GitHub Actions CI for e2e.

**After (M6)**

- Webpack stamps `manifest.version` from `package.json`.
- `pnpm check:manifest` (`scripts/check-manifest.mjs`) + soft budgets (see [`docs/BUNDLE-SIZE.md`](./docs/BUNDLE-SIZE.md)).
- CI workflow: unit → build → check → Playwright e2e (`.github/workflows/ci.yml`).
- Vite / CRX evaluation concluded **keep Webpack**.

---

## Features: new, updated, removed

### New (user-visible)

| Feature | Notes |
| ------- | ----- |
| Apply / remove toasts | “Applied to N matching tabs” / “Removed from N…” after save and toggle |
| Setup banner on unfinished scripts | Shown until URL patterns exist **and** the script is enabled |
| `runAt` control in IDE | Before / after page load in script ⋯ options (was export/runtime-only) |
| Problems-first drawer defaults | Default tab **problems**, drawer **collapsed** for new installs / default state |
| Injection e2e suite | Toggle-apply, CSS teardown/re-apply, unrelated-tab isolation |
| Manifest/bundle CI checks | Drift and size regression protection |

### Updated (same feature, better behavior or UX)

| Feature | Change |
| ------- | ------ |
| Enable / disable | Immediate matching-tab inject or CSS teardown (JS side effects still need reload — documented) |
| Save / import / rebuild refresh | Matching tabs (+ shared consumers when needed), not every open tab |
| CSS refresh | Replace semantics via bookmarks |
| Live compiled preview | Debounced / cancelable / drawer-gated |
| Draft sync conflicts | Keep local **persists**; dialog copy clarifies closing keeps local |
| Dirty indicator | Derived from drafts, not a mirrored `status` write |
| Command palette | Only real shortcut chip for palette open (`Cmd+K`); unbound Cmd+1/2/3/N chips removed |
| URL Pattern Tester | Open tabs + manual URL; history path removed |
| Dependencies UI | Remains in ⋯ (aligned with vision: not competing with code panes) |
| Docs | `docs/FEATURES.md` is the product SoT; root `FEATURES.md` redirects |

### Removed or dropped

| Item | Reason |
| ---- | ------ |
| Blunt all-tab refresh as the primary path | Replaced by matching apply (`refreshTabs` deprecated wrapper at most) |
| History-based pattern testing | No `history` permission; broken affordance removed |
| Fake palette shortcut labels | Trust / honesty |
| `GlobalStateContext` | Collapsed into Redux `ui` |
| Triplicate hydrate helpers | Single shared module |
| Eager “models for every script at boot” | Lazy closure (package.json extras for modules may still be broader where needed) |
| Mirrored draft→`userscripts.status` sync path | Dirty from drafts |

### Explicitly not done (still non-goals or deferred)

Aligned with the vision doc’s non-goals and intentional M5/M6 deferrals:

- No `GM_*` / userscript metadata header parser / isolated world
- No separate `packages/domain` or `packages/compile` rename (logic extracted into `shared` instead)
- No Vite migration
- No full “include shared CSS with dep inject” toggle (JS-only shared deps **documented**, not redesigned)
- No focus-mode / dedicated day-one empty Scripts landing beyond the setup banner
- Autosave not required (explicit Save / keep-local persist remain)

---

## Other migrations made along the way

These were supporting moves needed to land the milestones cleanly:

1. **Draft hygiene** — Lazy `ensureDraft`, prune clean drafts on switch, keep dirty drafts (and their Monaco models) when switching away so dispose races don’t crash the IDE.
2. **Monaco dispose fix** — Deferred model dispose (`queueMicrotask`) in VFS/workspace when switching scripts mid-attach.
3. **Conflict thunks** — `keepLocalConflictAndPersist` / `keepAllLocalConflictsAndPersist` as the sole keep-local write path.
4. **Selector extraction** — Compile-free `userscripts/selectors` and `editor-drafts/selectors` so popup/list code does not import the full slice module graph.
5. **Messaging awaits responses** — `appliedTabCount` / `removedTabCount` from the service worker for accurate toasts.
6. **E2E fixture hardening** — Toggle persistence wait fixed for enable; service-worker wait no longer leaves a dangling listener that failed the worker on teardown.
7. **Docs split** — Implementation plan status table + decision log updated for M1–M6; bundle notes live under `docs/BUNDLE-SIZE.md`.

---

## Test & verification posture

| Layer | Role after migration |
| ----- | -------------------- |
| Unit (`tests/*.test.mjs`) | Apply-scope, workspace closure, hydrate, shared-import resolution |
| Playwright (`e2e/`) | CRUD, drafts/conflicts, import/export, settings, metadata/`runAt`, **injection** |
| CI | Automates unit + production build + manifest budgets + e2e |

---

## How to read related docs

| Doc | Purpose |
| --- | ------- |
| [`docs/IDEAL-IMPLEMENTATION.md`](./docs/IDEAL-IMPLEMENTATION.md) | Target vision / “why” (not a changelog) |
| [`docs/IMPLEMENTATION-PLAN.md`](./docs/IMPLEMENTATION-PLAN.md) | Milestone checklist and decisions |
| [`docs/FEATURES.md`](./docs/FEATURES.md) | Current product behavior (source of truth) |
| [`docs/BUNDLE-SIZE.md`](./docs/BUNDLE-SIZE.md) | Bundle budgets and Webpack decision |

---

## Bottom line

The migration kept the same product identity and storage compatibility while fixing the highest-trust gaps (**injection**, **editor cost**, **draft coherence**) and tightening seams (**hydrate**, **popup bundle**, **CI**). UX was streamined toward **code + problems first**, with honest affordances and clearer apply feedback—not a redesign of the Graphite/Obsidian IDE language or a bundler rewrite.
