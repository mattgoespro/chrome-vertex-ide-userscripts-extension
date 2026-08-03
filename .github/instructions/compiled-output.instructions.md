---
name: "Userscript Compile Pipeline"
description: "Use when working with the userscript compile pipeline: prepareCompiledJavascript, buildUserscriptJavascript, compiled-code build metadata, and sandboxed SCSS compilation."
---

# Userscript Compile Pipeline

The userscript compile pipeline spans `packages/shared/src/compiled-output.ts` and `packages/renderer/src/sandbox/`. Preserve the ownership boundaries and transform order.

- `buildUserscriptJavascript(...)` compiles TypeScript first, then calls `prepareCompiledJavascript(...)`, then optionally minifies the already-transformed output. Do not move minification ahead of the shared-module transforms.
- Shared-module import and export rewriting happens at compile time in `packages/shared/src/compiled-output.ts`. Runtime injection should treat `script.code.compiled.javascript` as final, injection-ready code.
- Keep `CompiledCodeBuildMetadata` and helpers in `packages/shared/src/compile-metadata.ts` (`createCompiledCodeBuildMetadata`, `isCompiledCodeBuildCurrent`, …) in sync whenever you change build options or invalidation rules. `packages/renderer/src/sandbox/compiler.ts` re-exports those helpers for IDE call sites.
- SCSS compilation runs through the sandbox iframe because `dart-sass` needs relaxed CSP. If you change the message contract or sandbox lifecycle, review `sass-sandbox.ts`, `sass-sandbox.html`, and `public/manifest.json` together.
- If you change compiled output shape, rebuild behavior, or transform ordering, also review the userscript thunks and storage flows that persist `CompiledCodeEntry`.
