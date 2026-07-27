import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyCommitDraftForSave,
  applyFlushModelToDraft,
  applyMarkDraftClean,
  applyRemoteScriptAndClearConflict,
  applyResolveAllConflictsTakeRemote,
  applyResolveConflictKeepLocal,
  applyResolveConflictTakeRemote,
  applySaveRejectionDirtyRestore,
  applySuccessfulCodeSave,
  applySyncDraftFromRemote,
  applyUpdateDraftBuffer,
  nextDraftFromRemoteScript,
  rebuildDraftsPreservingDirty,
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

describe("rebuildDraftsPreservingDirty", () => {
  it("preserves dirty drafts and replaces clean ones from scripts", () => {
    const keep = buildUserscriptFixture({
      id: "keep",
      code: {
        source: { typescript: "export const saved = 1;", scss: "" },
      },
    });
    const replace = buildUserscriptFixture({
      id: "replace",
      code: {
        source: { typescript: "export const remote = 2;", scss: "" },
      },
    });
    const dropped = buildUserscriptFixture({ id: "dropped" });

    const existing = {
      keep: dirtyLocalDraft(keep),
      replace: draftFromScript(
        buildUserscriptFixture({
          id: "replace",
          code: {
            source: { typescript: "export const stale = 0;", scss: "" },
          },
        })
      ),
      dropped: draftFromScript(dropped),
    };

    const next = rebuildDraftsPreservingDirty(existing, [keep, replace]);

    assert.equal(next.keep, existing.keep);
    assert.equal(next.keep.typescript.includes("// local"), true);
    assert.equal(next.replace.typescript, "export const remote = 2;");
    assert.equal(next.replace.dirty.typescript, false);
    assert.equal(next.dropped, undefined);
  });

  it("creates drafts for scripts with no prior entry", () => {
    const script = buildUserscriptFixture({ id: "new" });
    const next = rebuildDraftsPreservingDirty({}, [script]);

    assert.deepEqual(next.new, draftFromScript(script));
  });
});

describe("applyUpdateDraftBuffer", () => {
  it("no-ops when code is unchanged", () => {
    const draft = draftFromScript(buildUserscriptFixture());
    const revision = draft.revision;

    assert.equal(
      applyUpdateDraftBuffer(draft, "typescript", draft.typescript),
      false
    );
    assert.equal(draft.dirty.typescript, false);
    assert.equal(draft.revision, revision);
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
  it("updates code without bumping revision when already dirty", () => {
    const draft = dirtyLocalDraft(buildUserscriptFixture());
    const revision = draft.revision;

    assert.equal(
      applyFlushModelToDraft(draft, "typescript", "export const flushed = 1;"),
      true
    );
    assert.equal(draft.typescript, "export const flushed = 1;");
    assert.equal(draft.dirty.typescript, true);
    assert.equal(draft.revision, revision);
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
    assert.equal(draft.dirty.typescript, false);
    assert.equal(draft.revision, 0);
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
    assert.equal(draft.lastSaveRequestId.typescript, "req-1");
    assert.equal(draft.revision, 4);
  });
});

describe("conflict resolution", () => {
  it("keep-local only clears the pending conflict", () => {
    const script = buildUserscriptFixture({ id: "s1" });
    const draft = dirtyLocalDraft(script);
    const pending = {
      s1: {
        scriptId: "s1",
        scriptName: script.name,
        remoteScript: script,
        buffers: [
          {
            buffer: "typescript",
            local: draft.typescript,
            remote: "export const remote = 9;",
          },
        ],
      },
    };

    applyResolveConflictKeepLocal(pending, "s1");
    assert.equal(pending.s1, undefined);
    assert.equal(draft.typescript.includes("// local"), true);
  });

  it("take-remote replaces the draft and clears the conflict", () => {
    const local = buildUserscriptFixture({ id: "s1" });
    const remote = buildUserscriptFixture({
      id: "s1",
      code: {
        source: { typescript: "export const remote = 9;", scss: "" },
      },
    });
    const state = {
      drafts: { s1: dirtyLocalDraft(local) },
      pendingConflicts: {
        s1: {
          scriptId: "s1",
          scriptName: remote.name,
          remoteScript: remote,
          buffers: [
            {
              buffer: "typescript",
              local: "local",
              remote: "export const remote = 9;",
            },
          ],
        },
      },
    };

    applyResolveConflictTakeRemote(state, remote);

    assert.equal(state.drafts.s1.typescript, "export const remote = 9;");
    assert.equal(state.drafts.s1.dirty.typescript, false);
    assert.equal(state.drafts.s1.revision, 4);
    assert.equal(state.pendingConflicts.s1, undefined);
  });

  it("take-all-remote applies each script and clears conflicts", () => {
    const a = buildUserscriptFixture({
      id: "a",
      code: { source: { typescript: "export const a = 1;", scss: "" } },
    });
    const b = buildUserscriptFixture({
      id: "b",
      code: { source: { typescript: "export const b = 2;", scss: "" } },
    });
    const state = {
      drafts: {
        a: dirtyLocalDraft(buildUserscriptFixture({ id: "a" })),
        b: dirtyLocalDraft(buildUserscriptFixture({ id: "b" })),
      },
      pendingConflicts: {
        a: {
          scriptId: "a",
          scriptName: "a",
          remoteScript: a,
          buffers: [],
        },
        b: {
          scriptId: "b",
          scriptName: "b",
          remoteScript: b,
          buffers: [],
        },
      },
    };

    applyResolveAllConflictsTakeRemote(state, [a, b]);

    assert.equal(state.drafts.a.typescript, "export const a = 1;");
    assert.equal(state.drafts.b.typescript, "export const b = 2;");
    assert.deepEqual(state.pendingConflicts, {});
  });
});

describe("remote apply vs sync", () => {
  it("applyRemoteScriptAndClearConflict clears pending conflicts", () => {
    const remote = buildUserscriptFixture({
      id: "s1",
      code: { source: { typescript: "export const r = 1;", scss: "" } },
    });
    const state = {
      drafts: {},
      pendingConflicts: {
        s1: {
          scriptId: "s1",
          scriptName: "s1",
          remoteScript: remote,
          buffers: [],
        },
      },
    };

    applyRemoteScriptAndClearConflict(state, remote);

    assert.equal(state.drafts.s1.typescript, "export const r = 1;");
    assert.equal(state.pendingConflicts.s1, undefined);
  });

  it("applySyncDraftFromRemote does not clear conflicts", () => {
    const remote = buildUserscriptFixture({
      id: "s1",
      code: { source: { typescript: "export const r = 1;", scss: "" } },
    });
    const drafts = {};
    const conflict = {
      scriptId: "s1",
      scriptName: "s1",
      remoteScript: remote,
      buffers: [],
    };
    const pendingConflicts = { s1: conflict };

    applySyncDraftFromRemote(drafts, remote);

    assert.equal(drafts.s1.typescript, "export const r = 1;");
    assert.equal(pendingConflicts.s1, conflict);
  });

  it("nextDraftFromRemoteScript creates or bumps", () => {
    const remote = buildUserscriptFixture({
      code: { source: { typescript: "export const r = 1;", scss: "" } },
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

describe("mark clean and save paths", () => {
  it("applyMarkDraftClean clears dirty and bumps revision", () => {
    const draft = dirtyLocalDraft(buildUserscriptFixture(), "scss");
    applyMarkDraftClean(draft, "scss");
    assert.equal(draft.dirty.scss, false);
    assert.equal(draft.revision, 4);
  });

  it("applySuccessfulCodeSave writes code and clears dirty", () => {
    const draft = dirtyLocalDraft(buildUserscriptFixture());
    applySuccessfulCodeSave(draft, "typescript", "export const saved = 1;");
    assert.equal(draft.typescript, "export const saved = 1;");
    assert.equal(draft.dirty.typescript, false);
    assert.equal(draft.revision, 4);
  });

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
