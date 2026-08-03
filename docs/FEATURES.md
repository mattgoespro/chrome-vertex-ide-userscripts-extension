# Invert IDE Userscripts

An in-browser IDE for writing **TypeScript** and **SCSS** userscripts, compiling them, and injecting them into matching web pages.

---

## How this differs from classic userscript managers

Invert is not a Tampermonkey / Violentmonkey / Greasemonkey clone.

| Invert                                               | Classic managers                       |
| ---------------------------------------------------- | -------------------------------------- |
| Scripts run as ordinary page JS and CSS (MAIN world) | Often isolated worlds + `GM_*` APIs    |
| Match via Invert URL patterns                        | `@match` / `@include` metadata headers |
| No grants, `GM_xmlhttpRequest`, or similar           | Grant-based privileged APIs            |

If you need sandboxing or `GM_*` helpers, this extension is a different product.

---

## Day one

1. Open **Invert IDE** from the toolbar popup.
2. **Create a script**, add URL patterns for the sites you care about, and **enable** it.
3. Write TypeScript and/or SCSS, then **save** (`Ctrl/Cmd+S`).
4. Visit a matching page — the compiled JS and CSS inject automatically.

Optionally: share a script as a module for other scripts to import, or attach CDN libraries.

---

## Core features

### Write

Author scripts in Invert IDE (Monaco) with TypeScript, SCSS, and per-script type definitions.

- Language-aware editing: diagnostics, completions, hover, quick fixes
- Collapsible drawer defaults to **Problems**; compiled JS/CSS preview is one click away
- Dependencies (shared imports + CDN attach) live in the script **⋯** menu — not in the code panes
- Save persists, compiles, re-injects matching open tabs, and toasts how many tabs were updated
- Local drafts until save, with a dirty indicator in the script list
- Sync conflicts: **Keep local** writes your draft to sync (overwrites remote); **Take remote** loads the synced version
- Command palette (`Ctrl/Cmd+K`) to jump pages, create scripts, and open scripts by name (only `Ctrl/Cmd+K` and `Ctrl/Cmd+S` are hard-bound shortcuts)

### Match

Control where each script runs with glob URL patterns (`*` / `?`).

- Enable or disable from the IDE or the toolbar popup (toasts applied/removed matching-tab counts)
- Badge shows how many scripts match the current tab
- URL Pattern Tester: check a typed URL or all open tabs
- New scripts show a setup banner until they have patterns and are enabled

### Inject

Matching **enabled** scripts run automatically on navigation.

- Compiled JavaScript in the page’s main world
- Compiled CSS inserted into the page
- Optional CDN libraries and shared-script dependencies load first
- Per-script **Run at** timing: before or after page load (IDE **⋯** menu; default before load)
- Saving (and import / minify rebuild) updates open tabs without restarting Chrome

### Compose

Reuse code across scripts:

- **Shared modules** — name a script so others can import `scripts/<name>/main` (and types); dependencies are detected from imports on save
- **CDN modules** — add libraries by URL, optionally link `@types` for IntelliSense, attach them per script

### Sync & move

- Scripts, modules, settings, and workspace layout sync via Chrome sync
- Export / import userscripts as JSON (import appends; validates and recompiles)
- Conflict dialog when remote changes meet unsaved drafts
- Storage quota breakdown in Settings

### Customize

Application and editor themes (with live preview), font size, tab size, format on save, and optional minify of compiled output.

---

## Appendix: behavior notes

Useful when composing shared modules or debugging “why didn’t this run?”

- **New scripts** start disabled, with no URL patterns — they never match until configured. The editor shows a setup banner until both are set.
- **Empty pattern list** matches nothing.
- **Badge and popup** list matching scripts whether enabled or not; only enabled scripts inject.
- **Injection order** on a page: CDN libraries → shared dependencies → userscript JS → userscript CSS (CDN and shared deps are de-duplicated).
- **Shared dependencies** inject for a matching consumer even if the shared script is disabled or would not match the page. Only the shared script’s **JS** is pulled that way; its CSS applies only when that script itself matches and runs.
- **Enable / disable** immediately applies or tears down on **matching open tabs** (no navigation required). Disable removes that script’s injected CSS when a prior insertion was tracked; MAIN-world **JS side effects are not undone** without a tab reload (the script will not run again on the next navigation).
- **Save / rebuild / import** re-apply only to tabs whose URL matches the affected script(s), including consumers when a shared module’s JS changes. CSS re-apply uses replace semantics (previous insertion removed before insert).
- **Run at** (`beforePageLoad` / `afterPageLoad`) is editable in the script options menu and preserved in import/export. New scripts default to before page load.
- **Import** appends new IDs; missing CDN module refs are warned and stripped. Shared-module problems can block import.
