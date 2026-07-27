import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildWorkspaceSyncPlan,
  getDraftBuffer,
} from "../packages/renderer/src/shared/services/workspace-sync-plan.ts";
import { draftFromScript } from "../packages/renderer/src/shared/store/slices/editor-drafts/state.editor-drafts.ts";
import {
  buildModuleFixture,
  buildUserscriptFixture,
} from "./helpers/fixtures.mjs";

describe("getDraftBuffer", () => {
  it("falls back to saved script contents when there is no draft", () => {
    const script = buildUserscriptFixture({
      typeDefinitions: "declare const X: number;",
      code: {
        source: { typescript: "export const a = 1;", scss: ".a{}" },
        compiled: { javascript: "", css: "" },
      },
    });

    assert.deepEqual(getDraftBuffer(script, undefined, "typescript"), {
      contents: "export const a = 1;",
      dirty: false,
    });
    assert.deepEqual(getDraftBuffer(script, undefined, "scss"), {
      contents: ".a{}",
      dirty: false,
    });
    assert.deepEqual(getDraftBuffer(script, undefined, "typeDefinitions"), {
      contents: "declare const X: number;",
      dirty: false,
    });
  });

  it("prefers draft contents and reports dirty for preserveAttachedBuffer", () => {
    const script = buildUserscriptFixture();
    const draft = draftFromScript(script);
    draft.typescript = "export const draft = 1;";
    draft.dirty.typescript = true;

    assert.deepEqual(getDraftBuffer(script, draft, "typescript"), {
      contents: "export const draft = 1;",
      dirty: true,
    });
  });
});

describe("buildWorkspaceSyncPlan", () => {
  it("sets dirty flags that drive preserveAttachedBuffer per buffer", () => {
    const script = buildUserscriptFixture({ id: "s1", moduleName: "alpha" });
    const draft = draftFromScript(script);
    draft.scss = ".dirty{}";
    draft.dirty.scss = true;

    const plan = buildWorkspaceSyncPlan({
      scripts: [script],
      drafts: { s1: draft },
      modules: {},
    });

    assert.equal(plan.buffers.length, 1);
    assert.equal(plan.buffers[0].modulePath, "alpha");
    assert.equal(plan.buffers[0].main.dirty, false);
    assert.equal(plan.buffers[0].styles.dirty, true);
    assert.equal(plan.buffers[0].styles.contents, ".dirty{}");
  });

  it("registers ambient libs for other scripts' module type panes only", () => {
    const open = buildUserscriptFixture({
      id: "open",
      moduleName: "open-mod",
      typeDefinitions: "export type Open = 1;",
    });
    const other = buildUserscriptFixture({
      id: "other",
      moduleName: "other-mod",
      typeDefinitions: "export type Other = 1;",
    });
    const nonModule = buildUserscriptFixture({
      id: "global",
      moduleName: "global-mod",
      typeDefinitions: "declare const GlobalThing: string;",
    });

    const plan = buildWorkspaceSyncPlan({
      scripts: [open, other, nonModule],
      drafts: {},
      currentScriptId: "open",
      modules: {},
    });

    assert.equal(plan.ambientLibs.length, 1);
    assert.equal(plan.ambientLibs[0].id, "ambient:other");
    assert.equal(
      plan.ambientLibs[0].filePath,
      "file:///scripts/other-mod/types.ambient.d.ts"
    );
    assert.match(plan.ambientLibs[0].contents, /type Other/);
    assert.doesNotMatch(plan.ambientLibs[0].contents, /^export /m);
  });

  it("skips blank ambient contents after export stripping", () => {
    const other = buildUserscriptFixture({
      id: "other",
      moduleName: "other-mod",
      typeDefinitions: "export { Foo } from './x';",
    });

    const plan = buildWorkspaceSyncPlan({
      scripts: [other],
      drafts: {},
      currentScriptId: "open",
      modules: {},
    });

    assert.equal(plan.ambientLibs.length, 0);
  });

  it("requests CDN types only for the open script modules with packageName", () => {
    const withTypes = buildModuleFixture({
      id: "m1",
      packageName: "lodash",
    });
    const withoutTypes = buildModuleFixture({
      id: "m2",
      packageName: undefined,
      url: "https://cdn.example.com/raw.js",
    });
    const unused = buildModuleFixture({
      id: "m3",
      packageName: "jquery",
    });

    const plan = buildWorkspaceSyncPlan({
      scripts: [buildUserscriptFixture({ id: "s1" })],
      drafts: {},
      currentScriptId: "s1",
      currentGlobalModules: ["m1", "m2", "missing"],
      modules: {
        m1: withTypes,
        m2: withoutTypes,
        m3: unused,
      },
    });

    assert.deepEqual(plan.cdnModules, [{ id: "m1", packageName: "lodash" }]);
  });
});
