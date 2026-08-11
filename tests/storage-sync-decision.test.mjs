import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { draftFromScript } from "../packages/renderer/src/shared/store/slices/editor-drafts/state.editor-drafts.ts";
import { decideStorageSyncAction } from "../packages/renderer/src/shared/store/slices/editor-drafts/storage-sync-decision.ts";
import { buildUserscriptFixture } from "./helpers/fixtures.mjs";

function dirtyDraft(script, buffer = "typescript") {
  const draft = draftFromScript(script);
  draft.dirty[buffer] = true;
  draft[buffer] = `${draft[buffer]}\n// local edit`;
  return draft;
}

describe("decideStorageSyncAction", () => {
  it("keeps a dirty local draft when the remote script is gone", () => {
    const script = buildUserscriptFixture({ id: "orphan" });
    const decision = decideStorageSyncAction(
      "orphan",
      dirtyDraft(script),
      undefined
    );
    assert.equal(decision.action, "keep-dirty-orphan");
  });

  it("removes a clean local draft when the remote script is gone", () => {
    const script = buildUserscriptFixture({ id: "gone" });
    const decision = decideStorageSyncAction(
      "gone",
      draftFromScript(script),
      undefined
    );
    assert.equal(decision.action, "remove");
  });

  it("removes when there is no remote and no local draft", () => {
    const decision = decideStorageSyncAction("missing", undefined, undefined);
    assert.equal(decision.action, "remove");
  });

  it("syncs from remote when there is no local draft", () => {
    const remote = buildUserscriptFixture({ id: "remote-only" });
    const decision = decideStorageSyncAction("remote-only", undefined, remote);
    assert.equal(decision.action, "sync");
    assert.equal(decision.script.id, "remote-only");
  });

  it("syncs when local draft is clean even if contents differ", () => {
    const remote = buildUserscriptFixture({
      id: "s1",
      code: {
        source: { typescript: "export const remote = 1;", scss: "" },
        compiled: { javascript: "", css: "" },
      },
    });
    const local = draftFromScript(
      buildUserscriptFixture({
        id: "s1",
        code: {
          source: { typescript: "export const local = 1;", scss: "" },
          compiled: { javascript: "", css: "" },
        },
      })
    );

    const decision = decideStorageSyncAction("s1", local, remote);
    assert.equal(decision.action, "sync");
    assert.equal(decision.script.code.source.typescript, "export const remote = 1;");
  });

  it("reports conflict when a dirty buffer differs from remote", () => {
    const remote = buildUserscriptFixture({
      id: "s1",
      name: "Remote",
      code: {
        source: { typescript: "export const remote = 1;", scss: "" },
        compiled: { javascript: "", css: "" },
      },
    });
    const localBase = buildUserscriptFixture({
      id: "s1",
      code: {
        source: { typescript: "export const local = 1;", scss: "" },
        compiled: { javascript: "", css: "" },
      },
    });
    const local = dirtyDraft(localBase, "typescript");

    const decision = decideStorageSyncAction("s1", local, remote);
    assert.equal(decision.action, "conflict");
    assert.equal(decision.conflict.scriptId, "s1");
    assert.equal(decision.conflict.buffers.length, 1);
    assert.equal(decision.conflict.buffers[0].buffer, "typescript");
  });

  it("syncs entity from remote when dirty and remote still matches lastSynced", () => {
    const script = buildUserscriptFixture({
      id: "s1",
      name: "Renamed",
      code: {
        source: { typescript: "export const v = 1;", scss: "" },
        compiled: { javascript: "", css: "" },
      },
    });
    const draft = dirtyDraft(script, "typescript");

    const decision = decideStorageSyncAction("s1", draft, script);
    assert.equal(decision.action, "sync-entity");
    // Entity keeps the remote/persisted snapshot — not the dirty draft buffer.
    assert.equal(
      decision.script.code.source.typescript,
      "export const v = 1;"
    );
    assert.equal(decision.script.name, "Renamed");
  });

  it("syncs entity when dirty buffers already match remote", () => {
    const remote = buildUserscriptFixture({
      id: "s1",
      code: {
        source: { typescript: "export const same = 1;", scss: "" },
        compiled: { javascript: "", css: "" },
      },
    });
    const draft = draftFromScript(remote);
    draft.dirty.typescript = true;

    const decision = decideStorageSyncAction("s1", draft, remote);
    assert.equal(decision.action, "sync-entity");
    assert.equal(
      decision.script.code.source.typescript,
      "export const same = 1;"
    );
  });
});
