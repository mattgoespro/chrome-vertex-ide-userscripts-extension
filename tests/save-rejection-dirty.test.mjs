import assert from "node:assert/strict";
import test from "node:test";
import {
  draftBufferForCodeLanguage,
  draftFromScript,
  shouldRestoreDirtyOnSaveRejection,
} from "../packages/renderer/src/shared/store/slices/editor-drafts/state.editor-drafts.ts";
import { buildUserscriptFixture } from "./helpers/fixtures.mjs";

test("draftBufferForCodeLanguage maps typescript and scss save args", () => {
  assert.equal(draftBufferForCodeLanguage("typescript"), "typescript");
  assert.equal(draftBufferForCodeLanguage("scss"), "scss");
});

test("shouldRestoreDirtyOnSaveRejection is true only for the latest request id", () => {
  assert.equal(shouldRestoreDirtyOnSaveRejection("req-2", "req-2"), true);
  assert.equal(shouldRestoreDirtyOnSaveRejection("req-2", "req-1"), false);
  assert.equal(shouldRestoreDirtyOnSaveRejection(undefined, "req-1"), false);
});

test("draftFromScript initializes empty lastSaveRequestId for save rejection tracking", () => {
  const draft = draftFromScript(buildUserscriptFixture());

  assert.deepEqual(draft.lastSaveRequestId, {});
  assert.equal(
    shouldRestoreDirtyOnSaveRejection(
      draft.lastSaveRequestId.typescript,
      "any-request"
    ),
    false
  );
});

test("save rejection restore flow: matching id restores; stale id does not", () => {
  const draft = draftFromScript(
    buildUserscriptFixture({
      code: {
        source: { typescript: "export const value = 1;", scss: "" },
      },
    })
  );

  // commitDraftForSave records the in-flight request and clears dirty.
  draft.lastSaveRequestId.typescript = "save-1";
  draft.dirty.typescript = false;
  draft.revision = 1;

  // Newer save supersedes the first before it rejects.
  draft.lastSaveRequestId.typescript = "save-2";
  draft.dirty.typescript = false;
  draft.revision = 2;

  assert.equal(
    shouldRestoreDirtyOnSaveRejection(
      draft.lastSaveRequestId.typescript,
      "save-1"
    ),
    false
  );

  assert.equal(
    shouldRestoreDirtyOnSaveRejection(
      draft.lastSaveRequestId.typescript,
      "save-2"
    ),
    true
  );

  // Matching rejection restores dirty and bumps revision (reducer contract).
  if (
    shouldRestoreDirtyOnSaveRejection(
      draft.lastSaveRequestId.typescript,
      "save-2"
    )
  ) {
    draft.dirty.typescript = true;
    draft.revision += 1;
  }

  assert.equal(draft.dirty.typescript, true);
  assert.equal(draft.revision, 3);
});
