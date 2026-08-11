import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyCommitDraftForSave,
  applyFlushModelToDraft,
  applyRemoteScriptAndClearConflict,
  applyResolveAllConflictsTakeRemote,
  applyResolveConflictKeepLocal,
  applyResolveConflictTakeRemote,
  applySaveRejectionDirtyRestore,
  applyUpdateDraftBuffer,
  nextDraftFromRemoteScript,
} from "../packages/renderer/src/shared/store/slices/editor-drafts/editor-drafts-transitions.ts";
import { draftFromScript } from "../packages/renderer/src/shared/store/slices/editor-drafts/state.editor-drafts.ts";
import { buildUserscriptFixture } from "./helpers/fixtures.mjs";

function dirtyLocalDraft(script, buffer = "typescript") {
  const draft = draftFromScript(script);
  draft[buffer] = `${draft[buffer]}\n// local`;
  draft.dirty[buffer] = true;
  draft.revision = 3;
  return draft;
}

describe("applyUpdateDraftBuffer", () => {
  it("no-ops when code is unchanged", () => {
    const draft = draftFromScript(buildUserscriptFixture());
    const revision = draft.revision;

    assert.equal(
      applyUpdateDraftBuffer(draft, "typescript", draft.typescript),
      false
    );
    assert.equal(draft.revision, revision);
    assert.equal(draft.dirty.typescript, false);
  });

  it("marks dirty and bumps revision when code changes", () => {
    const draft = draftFromScript(buildUserscriptFixture());

    assert.equal(
      applyUpdateDraftBuffer(draft, "scss", ".edited {}"),
      true
    );
    assert.equal(draft.scss, ".edited {}");
    assert.equal(draft.dirty.scss, true);
    assert.equal(draft.revision, 1);
  });
});

describe("applyFlushModelToDraft", () => {
  it("updates code, marks dirty, and bumps revision when already dirty", () => {
    const draft = dirtyLocalDraft(buildUserscriptFixture());
    const revision = draft.revision;

    assert.equal(
      applyFlushModelToDraft(draft, "typescript", "export const flushed = 1;"),
      true
    );
    assert.equal(draft.typescript, "export const flushed = 1;");
    assert.equal(draft.dirty.typescript, true);
    assert.equal(draft.revision, revision + 1);
  });

  it("marks dirty and bumps revision when previously clean", () => {
    const draft = draftFromScript(buildUserscriptFixture());

    assert.equal(
      applyFlushModelToDraft(draft, "typeDefinitions", "export type X = 1;"),
      true
    );
    assert.equal(draft.typeDefinitions, "export type X = 1;");
    assert.equal(draft.dirty.typeDefinitions, true);
    assert.equal(draft.revision, 1);
  });

  it("no-ops when flushed code already matches", () => {
    const draft = dirtyLocalDraft(buildUserscriptFixture());
    const before = { ...draft, dirty: { ...draft.dirty } };

    assert.equal(
      applyFlushModelToDraft(draft, "typescript", draft.typescript),
      false
    );
    assert.equal(draft.revision, before.revision);
  });
});

describe("applyCommitDraftForSave", () => {
  it("always records saveRequestId even when already clean", () => {
    const draft = draftFromScript(buildUserscriptFixture());

    assert.equal(
      applyCommitDraftForSave(
        draft,
        "typescript",
        draft.typescript,
        "req-clean"
      ),
      false
    );
    assert.equal(draft.lastSaveRequestId.typescript, "req-clean");
  });

  it("clears dirty, writes code, and bumps revision when committing a dirty buffer", () => {
    const draft = dirtyLocalDraft(buildUserscriptFixture());

    assert.equal(
      applyCommitDraftForSave(
        draft,
        "typescript",
        "export const committed = 1;",
        "req-1"
      ),
      true
    );
    assert.equal(draft.typescript, "export const committed = 1;");
    assert.equal(draft.dirty.typescript, false);
    assert.equal(draft.lastSynced.typescript, "export const committed = 1;");
    assert.equal(draft.lastSaveRequestId.typescript, "req-1");
    assert.equal(draft.revision, 4);
  });
});

describe("conflict resolution", () => {
  it("keep-local only clears the pending conflict", () => {
    const script = buildUserscriptFixture({ id: "s1" });
    const pending = {
      s1: {
        scriptId: "s1",
        scriptName: script.name,
        remoteScript: script,
        buffers: [],
      },
    };
    const draft = dirtyLocalDraft(script);

    applyResolveConflictKeepLocal(pending, "s1");
    assert.equal(pending.s1, undefined);
    assert.equal(draft.dirty.typescript, true);
  });

  it("take-remote replaces the draft and clears the conflict", () => {
    const local = buildUserscriptFixture({
      id: "s1",
      code: {
        source: { typescript: "export const local = 1;", scss: "" },
      },
    });
    const remote = buildUserscriptFixture({
      id: "s1",
      code: {
        source: { typescript: "export const remote = 2;", scss: "" },
      },
    });
    const state = {
      drafts: { s1: dirtyLocalDraft(local) },
      pendingConflicts: {
        s1: {
          scriptId: "s1",
          scriptName: remote.name,
          remoteScript: remote,
          buffers: [],
        },
      },
    };

    applyResolveConflictTakeRemote(state, remote);
    assert.equal(state.drafts.s1.typescript, "export const remote = 2;");
    assert.equal(state.drafts.s1.dirty.typescript, false);
    assert.equal(state.pendingConflicts.s1, undefined);
  });

  it("take-all-remote applies each script and clears conflicts", () => {
    const a = buildUserscriptFixture({
      id: "a",
      code: { source: { typescript: "export const a = 1;", scss: "" } },
    });
    const b = buildUserscriptFixture({
      id: "b",
      code: { source: { typescript: "export const b = 1;", scss: "" } },
    });
    const remoteA = buildUserscriptFixture({
      id: "a",
      code: { source: { typescript: "export const a = 2;", scss: "" } },
    });
    const remoteB = buildUserscriptFixture({
      id: "b",
      code: { source: { typescript: "export const b = 2;", scss: "" } },
    });
    const state = {
      drafts: {
        a: dirtyLocalDraft(a),
        b: dirtyLocalDraft(b),
      },
      pendingConflicts: {
        a: {
          scriptId: "a",
          scriptName: a.name,
          remoteScript: remoteA,
          buffers: [],
        },
        b: {
          scriptId: "b",
          scriptName: b.name,
          remoteScript: remoteB,
          buffers: [],
        },
      },
    };

    applyResolveAllConflictsTakeRemote(state, [remoteA, remoteB]);
    assert.equal(state.drafts.a.typescript, "export const a = 2;");
    assert.equal(state.drafts.b.typescript, "export const b = 2;");
    assert.deepEqual(state.pendingConflicts, {});
  });
});

describe("remote apply", () => {
  it("applyRemoteScriptAndClearConflict clears pending conflicts", () => {
    const remote = buildUserscriptFixture({
      id: "s1",
      code: {
        source: { typescript: "export const remote = 1;", scss: "" },
      },
    });
    const state = {
      drafts: { s1: dirtyLocalDraft(remote) },
      pendingConflicts: {
        s1: {
          scriptId: "s1",
          scriptName: remote.name,
          remoteScript: remote,
          buffers: [],
        },
      },
    };

    applyRemoteScriptAndClearConflict(state, remote);
    assert.equal(state.drafts.s1.typescript, "export const remote = 1;");
    assert.equal(state.pendingConflicts.s1, undefined);
  });

  it("nextDraftFromRemoteScript creates or bumps", () => {
    const remote = buildUserscriptFixture({
      id: "s1",
      code: {
        source: { typescript: "export const remote = 1;", scss: "" },
      },
    });

    assert.deepEqual(
      nextDraftFromRemoteScript(undefined, remote),
      draftFromScript(remote)
    );

    const existing = dirtyLocalDraft(remote);
    const next = nextDraftFromRemoteScript(existing, remote);
    assert.equal(next.revision, existing.revision + 1);
    assert.equal(next.dirty.typescript, false);
  });
});

describe("save rejection restore", () => {
  it("applySaveRejectionDirtyRestore respects request id gating", () => {
    const draft = draftFromScript(buildUserscriptFixture());
    draft.lastSaveRequestId.typescript = "req-2";
    draft.dirty.typescript = false;
    draft.revision = 2;

    assert.equal(
      applySaveRejectionDirtyRestore(draft, "typescript", "req-1"),
      false
    );
    assert.equal(draft.dirty.typescript, false);

    assert.equal(
      applySaveRejectionDirtyRestore(draft, "typescript", "req-2"),
      true
    );
    assert.equal(draft.dirty.typescript, true);
    assert.equal(draft.revision, 3);
  });
});
