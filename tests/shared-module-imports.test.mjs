import assert from "node:assert/strict";
import test from "node:test";
import { getSharedImportModuleNames } from "../packages/shared/src/shared-module-imports.ts";

test("getSharedImportModuleNames collects named, namespace, side-effect, and dynamic imports", () => {
  const sourceCode = [
    'import defaultValue, { helper as renamedHelper } from "scripts/runtime/main";',
    'import * as namespaceImport from "scripts/namespace/main";',
    'import "scripts/side-effects/main";',
    'const dynamic = await import("scripts/dynamic/main");',
  ].join("\n");

  assert.deepEqual(getSharedImportModuleNames(sourceCode).sort(), [
    "dynamic",
    "namespace",
    "runtime",
    "side-effects",
  ]);
});

test("getSharedImportModuleNames ignores type-only imports", () => {
  const sourceCode = [
    'import type { Foo } from "scripts/types-only/main";',
    'export type { Baz } from "scripts/types-reexport/main";',
    'import runtime from "scripts/runtime/main";',
  ].join("\n");

  assert.deepEqual(getSharedImportModuleNames(sourceCode), ["runtime"]);
});

test("getSharedImportModuleNames keeps runtime imports that mix inline type specifiers", () => {
  const sourceCode =
    'import { type Bar, helper } from "scripts/mixed/main";';

  assert.deepEqual(getSharedImportModuleNames(sourceCode), ["mixed"]);
});

test("getSharedImportModuleNames ignores non-scripts and types editor paths", () => {
  const sourceCode = [
    'import { x } from "scripts/runtime/types";',
    'import { y } from "./local";',
    'import { z } from "npm:lodash";',
  ].join("\n");

  assert.deepEqual(getSharedImportModuleNames(sourceCode), []);
});
