# AGENTS.md

## Cursor Cloud specific instructions

This repo is a **Chrome MV3 extension** ("Invert IDE Userscripts") built as a pnpm workspace
(`packages/*`, `plugins`, `examples/*`). It is 100% client-side: there is **no backend server,
database, or API**. Persistence uses `chrome.storage`. The "app" is the built `dist/` folder
loaded into Chrome as an unpacked extension.

Toolchain: Node + `pnpm@10.33.0` (see `packageManager`). After checkout, run `pnpm install`.

### Building (important gotcha)

`webpack.config.ts` is a **TypeScript** config in an **ESM** package, and `pnpm build` /
`pnpm dev` (`webpack ...`) fail on their own with
`ERR_UNKNOWN_FILE_EXTENSION ".ts"`. Webpack must load the TS config via the ts-node ESM loader.
Always run build/dev with:

```bash
TS_NODE_PROJECT=tsconfig.tools.json NODE_OPTIONS='--loader ts-node/esm' pnpm build   # -> dist/
TS_NODE_PROJECT=tsconfig.tools.json NODE_OPTIONS='--loader ts-node/esm' pnpm dev     # watch + hot-reload WS on :8081
```

The build emits harmless "asset size limit" warnings (Monaco bundles are large) and still exits 0.

### Lint / format

`pnpm lint` (eslint) and `pnpm format` (prettier) work as-is, no special env needed.
The root `pnpm test` script points at a non-existent `tests/` dir — ignore it; real tests are e2e.

### End-to-end tests (Playwright)

E2E loads the built extension into Chromium, so you **must build `dist/` first**
(`e2e/global-setup.ts` asserts `dist/manifest.json` exists). If you hit an error suggesting `npm run build`, use the build command from the section above (ts-node ESM loader).
Chrome extensions require a real/new headless mode, which the fixtures handle when `HEADLESS=true`.

```bash
# one-time browser binary install (done in setup): pnpm exec playwright install --with-deps chromium
pnpm e2e            # headed
pnpm e2e:headless   # HEADLESS=true, use this in the cloud VM (no persistent display needed)
```

Known state: `e2e/tests/scripts/draft-sync.spec.ts:105` ("unsaved edits survive switching away
and back") fails **deterministically** (not flaky) — appears to be a pre-existing app/test bug,
unrelated to environment setup. The other 24 e2e tests pass.

### Manually running the extension

Build `dist/`, then load it in Chrome via `chrome://extensions` → Developer Mode → "Load unpacked"
→ select `dist/`, or launch Chrome with `--load-extension=<abs>/dist`. Surfaces: popup
(`popup.html`), the IDE/options page (`options.html`, opens in a tab), background service worker,
and the sass sandbox (`sass-sandbox.html`).
