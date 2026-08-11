import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getDraftBuffer } from "../packages/renderer/src/shared/services/workspace-sync-plan.ts";
import { draftFromScript } from "../packages/renderer/src/shared/store/slices/editor-drafts/state.editor-drafts.ts";
import { buildUserscriptFixture } from "./helpers/fixtures.mjs";

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
