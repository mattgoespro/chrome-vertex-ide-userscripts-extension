import assert from "node:assert/strict";
import test from "node:test";
import {
  createCompiledCodeBuildMetadata,
  getCompiledOutputBuildOptions,
  isCompiledCodeBuildCurrent,
} from "../packages/renderer/src/sandbox/compiled-build-metadata.ts";

test("getCompiledOutputBuildOptions defaults minifyCompiledOutput to false", () => {
  assert.deepEqual(getCompiledOutputBuildOptions({}), {
    minifyCompiledOutput: false,
  });
  assert.deepEqual(
    getCompiledOutputBuildOptions({ minifyCompiledOutput: true }),
    { minifyCompiledOutput: true }
  );
});

test("isCompiledCodeBuildCurrent requires matching version and minify flag", () => {
  const options = { minifyCompiledOutput: true };
  const current = createCompiledCodeBuildMetadata(options);

  assert.equal(isCompiledCodeBuildCurrent(null, options), false);
  assert.equal(
    isCompiledCodeBuildCurrent(
      { javascript: "x", css: "", build: current },
      options
    ),
    true
  );
  assert.equal(
    isCompiledCodeBuildCurrent(
      {
        javascript: "x",
        css: "",
        build: { version: 1, minifyCompiledOutput: false },
      },
      options
    ),
    false
  );
  assert.equal(
    isCompiledCodeBuildCurrent(
      {
        javascript: "x",
        css: "",
        build: { version: 2, minifyCompiledOutput: true },
      },
      options
    ),
    false
  );
  assert.equal(
    isCompiledCodeBuildCurrent({ javascript: "x", css: "" }, options),
    false
  );
});
