import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isModuleDeclarationFile,
  stripExportsForAmbientLib,
} from "../packages/renderer/src/shared/services/ambient-type-defs.ts";

describe("isModuleDeclarationFile", () => {
  it("detects top-level export and import as modules", () => {
    assert.equal(isModuleDeclarationFile("export type Foo = string;"), true);
    assert.equal(
      isModuleDeclarationFile('import type { X } from "./x";\ntype Y = X;'),
      true
    );
  });

  it("treats ambient-only declarations as non-modules", () => {
    assert.equal(isModuleDeclarationFile("declare const foo: string;"), false);
    assert.equal(isModuleDeclarationFile("interface Foo { x: number }"), false);
  });
});

describe("stripExportsForAmbientLib", () => {
  it("strips export from named type/interface/const declarations", () => {
    const input = [
      "export type Foo = string;",
      "export interface Bar { x: number }",
      "export const Baz = 1;",
      "export declare function qux(): void;",
    ].join("\n");

    const output = stripExportsForAmbientLib(input);

    assert.match(output, /^type Foo = string;/m);
    assert.match(output, /^interface Bar \{ x: number \}/m);
    assert.match(output, /^const Baz = 1;/m);
    assert.match(output, /^declare function qux\(\): void;/m);
    assert.doesNotMatch(output, /^export /m);
  });

  it("removes named and namespace re-exports without stripping export type { }", () => {
    const input = [
      "export type Widget = number;",
      "export type { Widget };",
      "export { Widget } from './other';",
      "export * from './star';",
      "export * as ns from './ns';",
      "declare const keep: string;",
    ].join("\n");

    const output = stripExportsForAmbientLib(input);

    assert.match(output, /^type Widget = number;/m);
    assert.match(output, /^declare const keep: string;/m);
    assert.doesNotMatch(output, /export type \{ Widget \}/);
    assert.doesNotMatch(output, /export \{ Widget \}/);
    assert.doesNotMatch(output, /export \*/);
  });

  it("leaves non-export ambient content unchanged", () => {
    const input = "declare global {\n  interface Window { x: number }\n}\n";
    assert.equal(stripExportsForAmbientLib(input), input);
  });
});
