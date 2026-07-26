import assert from "node:assert/strict";
import test from "node:test";
import {
  prepareCompiledJavascript,
  wrapSharedScriptForInjection,
} from "../packages/shared/src/compiled-output.ts";

test("prepareCompiledJavascript rewrites scripts/*/main imports to __INVERT_SHARED__", () => {
  const compiledJavascript = [
    'import defaultValue, { helper as renamedHelper } from "scripts/runtime/main";',
    'import * as namespaceImport from "scripts/namespace/main";',
    'import "scripts/side-effects/main";',
    "console.log(defaultValue, renamedHelper, namespaceImport);",
  ].join("\n");

  const result = prepareCompiledJavascript(compiledJavascript, {});

  assert.match(
    result,
    /const defaultValue = window\.__INVERT_SHARED__\["runtime"\]\["default"\];/
  );
  assert.match(
    result,
    /const \{ helper: renamedHelper \} = window\.__INVERT_SHARED__\["runtime"\];/
  );
  assert.match(
    result,
    /const namespaceImport = window\.__INVERT_SHARED__\["namespace"\];/
  );
  assert.match(result, /window\.__INVERT_SHARED__\["side-effects"\];/);
  assert.match(
    result,
    /console\.log\(defaultValue, renamedHelper, namespaceImport\);/
  );
});

test("prepareCompiledJavascript leaves type-only and relative imports untouched", () => {
  const compiledJavascript = [
    'import type { Foo } from "scripts/types-only/main";',
    'import { helper } from "./relative";',
    "export const value = 1;",
  ].join("\n");

  const result = prepareCompiledJavascript(compiledJavascript, {});

  assert.equal(result, compiledJavascript);
});

test("prepareCompiledJavascript also rewrites scripts/*/types value imports", () => {
  const result = prepareCompiledJavascript(
    'import { named } from "scripts/runtime/types";',
    {}
  );

  assert.match(
    result,
    /const \{ named \} = window\.__INVERT_SHARED__\["runtime"\];/
  );
});

test("wrapSharedScriptForInjection exposes named and default exports on __INVERT_SHARED__", () => {
  const compiledJs = [
    "export const helper = 1;",
    "export default function main() { return helper; }",
  ].join("\n");

  const result = wrapSharedScriptForInjection("runtime", compiledJs);

  assert.match(result, /window\.__INVERT_SHARED__=window\.__INVERT_SHARED__\|\|\{\};/);
  assert.match(result, /__ns__\["helper"\]=helper/);
  assert.match(result, /__ns__\["default"\]=main/);
  assert.match(
    result,
    /window\.__INVERT_SHARED__\["runtime"\]=__ns__;/
  );
  assert.doesNotMatch(result, /\bexport\b/);
});

test("wrapSharedScriptForInjection rejects re-exports from other modules", () => {
  assert.throws(
    () =>
      wrapSharedScriptForInjection(
        "runtime",
        'export { helper } from "scripts/other/main";'
      ),
    /re-export.*not supported/i
  );
});

test("prepareCompiledJavascript wraps shared modules when requested", () => {
  const result = prepareCompiledJavascript("export const answer = 42;", {
    shared: true,
    moduleName: "math",
  });

  assert.match(result, /window\.__INVERT_SHARED__\["math"\]=__ns__;/);
  assert.match(result, /__ns__\["answer"\]=answer/);
});
