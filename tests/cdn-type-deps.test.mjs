import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractFileDependencies,
  normalizeRelativePath,
} from "../packages/monaco/src/typescript/cdn-type-deps.ts";

describe("normalizeRelativePath", () => {
  it("resolves sibling and parent paths and appends .d.ts", () => {
    assert.equal(
      normalizeRelativePath("index.d.ts", "./foo"),
      "foo.d.ts"
    );
    assert.equal(
      normalizeRelativePath("lib/index.d.ts", "./nested/bar"),
      "lib/nested/bar.d.ts"
    );
    assert.equal(
      normalizeRelativePath("lib/sub/a.d.ts", "../b"),
      "lib/b.d.ts"
    );
  });

  it("preserves existing .d.ts and .ts suffixes", () => {
    assert.equal(
      normalizeRelativePath("index.d.ts", "./foo.d.ts"),
      "foo.d.ts"
    );
    assert.equal(normalizeRelativePath("index.d.ts", "./foo.ts"), "foo.ts");
  });

  it("ignores '.' and empty segments", () => {
    assert.equal(
      normalizeRelativePath("pkg/index.d.ts", "././types"),
      "pkg/types.d.ts"
    );
  });
});

describe("extractFileDependencies", () => {
  it("collects triple-slash path references", () => {
    const contents = [
      '/// <reference path="./helpers.d.ts" />',
      '/// <reference path="../shared/util" />',
      "export {};",
    ].join("\n");

    const deps = extractFileDependencies("lib/index.d.ts", contents);
    assert.deepEqual(deps.files.sort(), [
      "lib/helpers.d.ts",
      "shared/util.d.ts",
    ]);
    assert.deepEqual(deps.packages, []);
  });

  it("collects triple-slash types package references", () => {
    const contents = '/// <reference types="node" />\nexport {};';
    const deps = extractFileDependencies("index.d.ts", contents);
    assert.deepEqual(deps.packages, ["node"]);
    assert.deepEqual(deps.files, []);
  });

  it("collects relative import and export specifiers", () => {
    // Dynamic import must be line-leading — the production regex anchors on
    // ^ or \n before `import(`, matching how DefinitelyTyped files are written.
    const contents = [
      'import type { A } from "./a";',
      'export { B } from "../b";',
      'import("./c");',
    ].join("\n");

    const deps = extractFileDependencies("pkg/index.d.ts", contents);
    assert.deepEqual(deps.files.sort(), [
      "b.d.ts",
      "pkg/a.d.ts",
      "pkg/c.d.ts",
    ]);
  });

  it("ignores non-relative and bare package imports", () => {
    const contents = [
      'import type { X } from "lodash";',
      'export * from "react";',
    ].join("\n");

    const deps = extractFileDependencies("index.d.ts", contents);
    assert.deepEqual(deps.files, []);
    assert.deepEqual(deps.packages, []);
  });
});
