# Bundle size notes (M6)

Measured after production `pnpm build` (approximate; CI enforces soft budgets).

| Entry | Typical size | Notes |
| ----- | ------------ | ----- |
| `background.js` | ~16 KB | Already minimal; budget 50 KB |
| `popup.js` | ~313 KB | Compile-free store path (M4); budget 400 KB |
| `options.js` | ~2 MB (+ Monaco chunk ~12 MB) | IDE + Monaco by design — not a lean target |
| `build-worker.js` / `sass-sandbox.js` | ~3–4 MB | Off-thread / sandboxed compilers |

**Decision:** Keep Webpack. No Vite migration required for M6 — DX is not blocked, and Monaco/Sass worker seams already fit the current pipeline.

Run `pnpm run check:manifest` after build to assert version sync, required assets, and popup/background budgets.
