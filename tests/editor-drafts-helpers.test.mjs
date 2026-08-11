import assert from "node:assert/strict";
import test from "node:test";
import {
  detectDraftConflict,
  extractUserscriptMetadataUpdates,
} from "../packages/renderer/src/shared/store/slices/editor-drafts/helpers.ts";
import { buildUserscriptFixture } from "./helpers/chrome-sync-mock.mjs";

function buildDraft(overrides = {}) {
  const base = {
    typescript: "export const local = 1;",
    scss: "",
    typeDefinitions: "",
    dirty: {
      typescript: false,
      scss: false,
      typeDefinitions: false,
    },
    lastSynced: {
      typescript: "export const local = 1;",
      scss: "",
      typeDefinitions: "",
    },
    revision: 1,
  };

  const merged = { ...base, ...overrides };

  if (overrides.dirty) {
    merged.dirty = { ...base.dirty, ...overrides.dirty };
  }

  if (!overrides.lastSynced) {
    merged.lastSynced = {
      typescript: merged.typescript,
      scss: merged.scss,
      typeDefinitions: merged.typeDefinitions,
    };
  }

  return merged;
}

test("detectDraftConflict returns null when no buffers are dirty", () => {
  const remote = buildUserscriptFixture({
    code: {
      source: { typescript: "export const remote = 2;", scss: "" },
      compiled: { javascript: "", css: "" },
    },
  });

  assert.equal(
    detectDraftConflict("script-1", buildDraft(), remote),
    null
  );
});

test("detectDraftConflict returns null when dirty buffers already match remote", () => {
  const remote = buildUserscriptFixture({
    code: {
      source: { typescript: "export const same = 1;", scss: "" },
      compiled: { javascript: "", css: "" },
    },
  });
  const draft = buildDraft({
    typescript: "export const same = 1;",
    dirty: { typescript: true, scss: false, typeDefinitions: false },
  });

  assert.equal(detectDraftConflict("script-1", draft, remote), null);
});

test("detectDraftConflict returns null when remote still matches lastSynced baseline", () => {
  const remote = buildUserscriptFixture({
    code: {
      source: { typescript: "export const local = 1;", scss: "" },
      compiled: { javascript: "", css: "" },
    },
  });
  const draft = buildDraft({
    typescript: "export const local = 1;\n// edit",
    dirty: { typescript: true, scss: false, typeDefinitions: false },
    lastSynced: {
      typescript: "export const local = 1;",
      scss: "",
      typeDefinitions: "",
    },
  });

  assert.equal(detectDraftConflict("script-1", draft, remote), null);
});

test("detectDraftConflict reports only dirty buffers that differ from remote", () => {
  const remote = buildUserscriptFixture({
    name: "Remote Script",
    typeDefinitions: "export type Remote = number;",
    code: {
      source: {
        typescript: "export const remote = 2;",
        scss: ".remote {}",
      },
      compiled: { javascript: "", css: "" },
    },
  });
  const draft = buildDraft({
    typescript: "export const local = 1;",
    scss: ".local {}",
    typeDefinitions: "export type Local = string;",
    dirty: {
      typescript: true,
      scss: false,
      typeDefinitions: true,
    },
    lastSynced: {
      typescript: "export const local = 1;",
      scss: ".local {}",
      typeDefinitions: "export type Local = string;",
    },
  });

  const conflict = detectDraftConflict("script-1", draft, remote);

  assert.ok(conflict);
  assert.equal(conflict.scriptId, "script-1");
  assert.equal(conflict.scriptName, "Remote Script");
  assert.deepEqual(
    conflict.buffers.map((buffer) => buffer.buffer),
    ["typescript", "typeDefinitions"]
  );
  assert.equal(conflict.buffers[0].local, "export const local = 1;");
  assert.equal(conflict.buffers[0].remote, "export const remote = 2;");
  assert.equal(conflict.buffers[1].local, "export type Local = string;");
  assert.equal(conflict.buffers[1].remote, "export type Remote = number;");
});

test("extractUserscriptMetadataUpdates keeps only metadata fields", () => {
  const updates = extractUserscriptMetadataUpdates({
    name: "Renamed",
    enabled: false,
    shared: true,
    moduleName: "renamed",
    globalModules: ["mod-1"],
    urlPatterns: ["https://example.com/*"],
    runAt: "beforePageLoad",
    id: "should-omit",
    code: {
      source: { typescript: "should-omit", scss: "" },
      compiled: { javascript: "", css: "" },
    },
    status: "modified",
  });

  assert.deepEqual(updates, {
    name: "Renamed",
    enabled: false,
    shared: true,
    moduleName: "renamed",
    globalModules: ["mod-1"],
    urlPatterns: ["https://example.com/*"],
    runAt: "beforePageLoad",
  });
});

test("extractUserscriptMetadataUpdates omits undefined fields", () => {
  assert.deepEqual(extractUserscriptMetadataUpdates({ name: "Only Name" }), {
    name: "Only Name",
  });
});
