import assert from "node:assert/strict";
import test from "node:test";
import {
  applyCommitDraftForSave,
  applyFlushModelToDraft,
  applyMarkDraftClean,
  applyRemoteScriptToDraft,
  applyTakeRemoteScript,
  applyUpdateDraftBuffer,
  buildDraftsPreservingDirty,
  clearPendingConflict,
} from "../packages/renderer/src/shared/store/slices/editor-drafts/draft-reducer-ops.ts";
import { draftFromScript } from "../packages/renderer/src/shared/store/slices/editor-drafts/state.editor-drafts.ts";
import { buildUserscriptFixture } from "./helpers/fixtures.mjs";

function dirtyDraft(overrides = {}) {
  return {
    ...draftFromScript(
      buildUserscriptFixture({
        code: {
          source: { typescript: "export const local = 1;", scss: "" },
        },
      })
    ),
    dirty: {
      typescript: true,
      scss: false,
      typeDefinitions: false,
    },
    revision: 2,
    ...overrides,
  };
}

test("buildDraftsPreservingDirty keeps dirty drafts and rebuilds clean ones", () => {
  const kept = dirtyDraft({ typescript: "export const dirty = 1;" });
  const clean = draftFromScript(
    buildUserscriptFixture({
      id: "script-clean",
      code: { source: { typescript: "export const clean = 1;", scss: "" } },
    })
  );
  const orphanDirty = dirtyDraft({
    typescript: "export const orphan = 1;",
  });

  const scripts = [
    buildUserscriptFixture({
      id: "script-1",
      code: { source: { typescript: "export const remote = 9;", scss: "" } },
    }),
    buildUserscriptFixture({
      id: "script-clean",
      code: {
        source: { typescript: "export const remote-clean = 9;", scss: "" },
      },
    }),
  ];

  const next = buildDraftsPreservingDirty(
    {
      "script-1": kept,
      "script-clean": clean,
      "script-orphan": orphanDirty,
    },
    scripts
  );

  assert.equal(next["script-1"], kept);
  assert.equal(next["script-1"].typescript, "export const dirty = 1;");
  assert.equal(next["script-clean"].typescript, "export const remote-clean = 9;");
  assert.equal(next["script-clean"].dirty.typescript, false);
  assert.equal(next["script-orphan"], undefined);
});

test("buildDraftsPreservingDirty seeds drafts for scripts with no prior entry", () => {
  const script = buildUserscriptFixture({
    id: "new-script",
    code: { source: { typescript: "export const neu = 1;", scss: ".n {}" } },
  });

  const next = buildDraftsPreservingDirty({}, [script]);

  assert.deepEqual(next["new-script"], draftFromScript(script));
});

test("applyUpdateDraftBuffer marks dirty and bumps revision on change", () => {
  const draft = draftFromScript(buildUserscriptFixture());
  const next = applyUpdateDraftBuffer(
    draft,
    "typescript",
    "export const edited = 1;"
  );

  assert.ok(next);
  assert.equal(next.typescript, "export const edited = 1;");
  assert.equal(next.dirty.typescript, true);
  assert.equal(next.revision, 1);
});

test("applyUpdateDraftBuffer no-ops for missing draft or identical code", () => {
  assert.equal(
    applyUpdateDraftBuffer(undefined, "typescript", "x"),
    undefined
  );

  const draft = draftFromScript(
    buildUserscriptFixture({
      code: { source: { typescript: "export const same = 1;", scss: "" } },
    })
  );

  assert.equal(
    applyUpdateDraftBuffer(draft, "typescript", "export const same = 1;"),
    undefined
  );
});

test("applyMarkDraftClean clears dirty and bumps revision", () => {
  const draft = dirtyDraft();
  const next = applyMarkDraftClean(draft, "typescript");

  assert.ok(next);
  assert.equal(next.dirty.typescript, false);
  assert.equal(next.revision, 3);
  assert.equal(applyMarkDraftClean(undefined, "scss"), undefined);
});

test("applyFlushModelToDraft bumps revision only when first dirtying a buffer", () => {
  const clean = draftFromScript(
    buildUserscriptFixture({
      code: { source: { typescript: "export const a = 1;", scss: "" } },
    })
  );

  const firstFlush = applyFlushModelToDraft(
    clean,
    "typescript",
    "export const b = 2;"
  );

  assert.ok(firstFlush);
  assert.equal(firstFlush.dirty.typescript, true);
  assert.equal(firstFlush.revision, 1);

  const secondFlush = applyFlushModelToDraft(
    firstFlush,
    "typescript",
    "export const c = 3;"
  );

  assert.ok(secondFlush);
  assert.equal(secondFlush.typescript, "export const c = 3;");
  assert.equal(secondFlush.dirty.typescript, true);
  // Already dirty: code updates without another revision bump.
  assert.equal(secondFlush.revision, 1);
});

test("applyFlushModelToDraft no-ops when code is unchanged", () => {
  const draft = draftFromScript(
    buildUserscriptFixture({
      code: { source: { typescript: "export const same = 1;", scss: "" } },
    })
  );

  assert.equal(
    applyFlushModelToDraft(draft, "typescript", "export const same = 1;"),
    undefined
  );
  assert.equal(
    applyFlushModelToDraft(undefined, "typescript", "x"),
    undefined
  );
});

test("applyCommitDraftForSave records request id, clears dirty, and bumps revision", () => {
  const draft = dirtyDraft({
    typescript: "export const pending = 1;",
  });

  const next = applyCommitDraftForSave(
    draft,
    "typescript",
    "export const pending = 1;",
    "save-req-1"
  );

  assert.ok(next);
  assert.equal(next.lastSaveRequestId.typescript, "save-req-1");
  assert.equal(next.dirty.typescript, false);
  assert.equal(next.revision, 3);
});

test("applyCommitDraftForSave still records request id when already clean with matching code", () => {
  const draft = draftFromScript(
    buildUserscriptFixture({
      code: { source: { typescript: "export const clean = 1;", scss: "" } },
    })
  );

  const next = applyCommitDraftForSave(
    draft,
    "typescript",
    "export const clean = 1;",
    "save-req-2"
  );

  assert.ok(next);
  assert.equal(next.lastSaveRequestId.typescript, "save-req-2");
  assert.equal(next.dirty.typescript, false);
  assert.equal(next.revision, 0);
  assert.equal(next.typescript, "export const clean = 1;");
});

test("applyCommitDraftForSave updates code when committing a dirty buffer with new text", () => {
  const draft = dirtyDraft({ typescript: "export const old = 1;" });
  const next = applyCommitDraftForSave(
    draft,
    "typescript",
    "export const written = 2;",
    "save-req-3"
  );

  assert.ok(next);
  assert.equal(next.typescript, "export const written = 2;");
  assert.equal(next.dirty.typescript, false);
  assert.equal(next.lastSaveRequestId.typescript, "save-req-3");
  assert.equal(next.revision, 3);
  assert.equal(
    applyCommitDraftForSave(undefined, "typescript", "x", "id"),
    undefined
  );
});

test("clearPendingConflict removes only the targeted script id", () => {
  const conflictA = {
    scriptId: "a",
    scriptName: "A",
    remoteScript: buildUserscriptFixture({ id: "a" }),
    buffers: [
      { buffer: "typescript", local: "l", remote: "r" },
    ],
  };
  const conflictB = {
    scriptId: "b",
    scriptName: "B",
    remoteScript: buildUserscriptFixture({ id: "b" }),
    buffers: [{ buffer: "scss", local: "l", remote: "r" }],
  };

  const pending = { a: conflictA, b: conflictB };
  const next = clearPendingConflict(pending, "a");

  assert.equal(next.a, undefined);
  assert.equal(next.b, conflictB);
  assert.equal(clearPendingConflict(pending, "missing"), pending);
});

test("applyTakeRemoteScript replaces draft from remote and clears conflict", () => {
  const local = dirtyDraft({
    typescript: "export const local = 1;",
    revision: 4,
  });
  const remote = buildUserscriptFixture({
    id: "script-1",
    name: "Remote",
    typeDefinitions: "export type R = number;",
    code: {
      source: {
        typescript: "export const remote = 2;",
        scss: ".remote {}",
      },
    },
  });
  const pending = {
    "script-1": {
      scriptId: "script-1",
      scriptName: "Remote",
      remoteScript: remote,
      buffers: [
        {
          buffer: "typescript",
          local: "export const local = 1;",
          remote: "export const remote = 2;",
        },
      ],
    },
    other: {
      scriptId: "other",
      scriptName: "Other",
      remoteScript: buildUserscriptFixture({ id: "other" }),
      buffers: [],
    },
  };

  const result = applyTakeRemoteScript(local, remote, pending);

  assert.equal(result.draft.typescript, "export const remote = 2;");
  assert.equal(result.draft.scss, ".remote {}");
  assert.equal(result.draft.typeDefinitions, "export type R = number;");
  assert.equal(result.draft.dirty.typescript, false);
  assert.equal(result.draft.revision, 5);
  assert.deepEqual(result.draft.lastSaveRequestId, {});
  assert.equal(result.pendingConflicts["script-1"], undefined);
  assert.ok(result.pendingConflicts.other);
});

test("applyRemoteScriptToDraft creates a fresh draft when none exists", () => {
  const remote = buildUserscriptFixture({
    id: "brand-new",
    code: { source: { typescript: "export const neu = 1;", scss: "" } },
  });

  assert.deepEqual(
    applyRemoteScriptToDraft(undefined, remote),
    draftFromScript(remote)
  );
});
