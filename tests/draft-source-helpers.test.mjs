import assert from "node:assert/strict";
import test from "node:test";
import {
  buildScriptWithDraftSource,
  getDraftOrSavedSource,
} from "../packages/renderer/src/shared/store/slices/editor-drafts/helpers.ts";
import { buildUserscriptFixture } from "./helpers/fixtures.mjs";

test("getDraftOrSavedSource prefers draft buffers when a draft exists", () => {
  const script = buildUserscriptFixture({
    id: "script-1",
    typeDefinitions: "export type Saved = number;",
    code: {
      source: {
        typescript: "export const saved = 1;",
        scss: ".saved {}",
      },
    },
  });

  const source = getDraftOrSavedSource(
    {
      editorDrafts: {
        drafts: {
          "script-1": {
            typescript: "export const draft = 2;",
            scss: ".draft {}",
            typeDefinitions: "export type Draft = string;",
            dirty: {
              typescript: true,
              scss: true,
              typeDefinitions: true,
            },
            revision: 3,
            lastSaveRequestId: {},
          },
        },
        pendingConflicts: {},
      },
      userscripts: { scripts: { "script-1": script } },
    },
    "script-1"
  );

  assert.deepEqual(source, {
    typescript: "export const draft = 2;",
    scss: ".draft {}",
    typeDefinitions: "export type Draft = string;",
  });
});

test("getDraftOrSavedSource falls back to saved script source when no draft exists", () => {
  const script = buildUserscriptFixture({
    id: "script-1",
    typeDefinitions: "export type Saved = number;",
    code: {
      source: {
        typescript: "export const saved = 1;",
        scss: ".saved {}",
      },
    },
  });

  const source = getDraftOrSavedSource(
    {
      editorDrafts: { drafts: {}, pendingConflicts: {} },
      userscripts: { scripts: { "script-1": script } },
    },
    "script-1"
  );

  assert.deepEqual(source, {
    typescript: "export const saved = 1;",
    scss: ".saved {}",
    typeDefinitions: "export type Saved = number;",
  });
});

test("getDraftOrSavedSource returns empty strings when neither draft nor script exists", () => {
  assert.deepEqual(
    getDraftOrSavedSource(
      {
        editorDrafts: { drafts: {}, pendingConflicts: {} },
        userscripts: { scripts: {} },
      },
      "missing"
    ),
    {
      typescript: "",
      scss: "",
      typeDefinitions: "",
    }
  );
});

test("buildScriptWithDraftSource overlays draft buffers onto the script", () => {
  const script = buildUserscriptFixture({
    name: "Original",
    typeDefinitions: "export type Old = number;",
    code: {
      source: {
        typescript: "export const old = 1;",
        scss: ".old {}",
      },
      compiled: {
        javascript: "console.log('compiled');",
        css: ".compiled{}",
      },
    },
  });

  const next = buildScriptWithDraftSource(script, {
    typescript: "export const next = 2;",
    scss: ".next {}",
    typeDefinitions: "export type Next = string;",
  });

  assert.equal(next.name, "Original");
  assert.equal(next.typeDefinitions, "export type Next = string;");
  assert.deepEqual(next.code.source, {
    typescript: "export const next = 2;",
    scss: ".next {}",
  });
  assert.deepEqual(next.code.compiled, {
    javascript: "console.log('compiled');",
    css: ".compiled{}",
  });
});
