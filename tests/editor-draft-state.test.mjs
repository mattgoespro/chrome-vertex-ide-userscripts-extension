import assert from "node:assert/strict";
import test from "node:test";
import {
  bumpDraftRevision,
  draftFromScript,
  isDraftDirty,
} from "../packages/renderer/src/shared/store/slices/editor-drafts/state.editor-drafts.ts";
import { buildUserscriptFixture } from "./helpers/fixtures.mjs";

test("draftFromScript copies source buffers and starts clean at revision 0", () => {
  const script = buildUserscriptFixture({
    typeDefinitions: "export type Id = string;",
    code: {
      source: {
        typescript: "export const value = 1;",
        scss: ".root {}",
      },
    },
  });

  assert.deepEqual(draftFromScript(script), {
    typescript: "export const value = 1;",
    scss: ".root {}",
    typeDefinitions: "export type Id = string;",
    dirty: {
      typescript: false,
      scss: false,
      typeDefinitions: false,
    },
    revision: 0,
    lastSaveRequestId: {},
  });
});

test("isDraftDirty is false for missing drafts and clean buffers", () => {
  assert.equal(isDraftDirty(undefined), false);
  assert.equal(
    isDraftDirty({
      typescript: "",
      scss: "",
      typeDefinitions: "",
      dirty: {
        typescript: false,
        scss: false,
        typeDefinitions: false,
      },
      revision: 0,
    }),
    false
  );
});

test("isDraftDirty is true when any buffer is dirty", () => {
  assert.equal(
    isDraftDirty({
      typescript: "x",
      scss: "",
      typeDefinitions: "",
      dirty: {
        typescript: false,
        scss: true,
        typeDefinitions: false,
      },
      revision: 2,
    }),
    true
  );
});

test("bumpDraftRevision replaces buffers from the remote script and increments revision", () => {
  const existing = {
    typescript: "old",
    scss: "old",
    typeDefinitions: "old",
    dirty: {
      typescript: true,
      scss: true,
      typeDefinitions: true,
    },
    revision: 4,
  };
  const remote = buildUserscriptFixture({
    typeDefinitions: "export type Remote = number;",
    code: {
      source: {
        typescript: "export const remote = 2;",
        scss: ".remote {}",
      },
    },
  });

  assert.deepEqual(bumpDraftRevision(existing, remote), {
    typescript: "export const remote = 2;",
    scss: ".remote {}",
    typeDefinitions: "export type Remote = number;",
    dirty: {
      typescript: false,
      scss: false,
      typeDefinitions: false,
    },
    revision: 5,
    lastSaveRequestId: {},
  });
});
