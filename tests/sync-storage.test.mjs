import assert from "node:assert/strict";
import test from "node:test";
import {
  buildUserscriptFixture,
  installChromeSyncMock,
} from "./helpers/chrome-sync-mock.mjs";

const mock = installChromeSyncMock();
const { ChromeSyncStorage } = await import(
  "../packages/shared/src/storage/sync.storage.ts"
);

test.beforeEach(() => {
  mock.reset();
});

test("ChromeSyncStorage round-trips a small userscript through sync storage", async () => {
  const script = buildUserscriptFixture({
    code: {
      source: {
        typescript: "export const answer = 42;",
        scss: ".root { color: red; }",
      },
      compiled: { javascript: "", css: "" },
    },
  });

  await ChromeSyncStorage.saveScript(script);
  const loaded = await ChromeSyncStorage.getAllScripts();

  assert.equal(Object.keys(loaded).length, 1);
  assert.equal(loaded[script.id].name, script.name);
  assert.equal(loaded[script.id].enabled, true);
  assert.equal(loaded[script.id].code.source.typescript, "export const answer = 42;");
  assert.equal(loaded[script.id].code.source.scss, ".root { color: red; }");
  assert.deepEqual(loaded[script.id].urlPatterns, ["https://example.com/*"]);
  assert.equal(loaded[script.id].runAt, "afterPageLoad");
});

test("ChromeSyncStorage chunks oversized payloads and restores them", async () => {
  // Force utf8-base64 so payload size is predictable without relying on gzip ratios.
  const previousCompressionStream = globalThis.CompressionStream;
  // eslint-disable-next-line no-global-assign
  globalThis.CompressionStream = undefined;

  try {
    const largeSource = `export const blob = ${JSON.stringify(
      "x".repeat(8_000)
    )};`;
    const script = buildUserscriptFixture({
      id: "large-script",
      code: {
        source: { typescript: largeSource, scss: "" },
        compiled: { javascript: "", css: "" },
      },
    });

    await ChromeSyncStorage.saveScript(script);

    const manifest = mock.store.get("userscript:large-script");
    assert.equal(manifest.mode, "chunked");
    assert.ok(manifest.chunkCount >= 2);

    for (let index = 0; index < manifest.chunkCount; index++) {
      assert.equal(
        typeof mock.store.get(`userscript:large-script:chunk:${index}`),
        "string"
      );
    }

    const loaded = await ChromeSyncStorage.getAllScripts();
    assert.equal(loaded["large-script"].code.source.typescript, largeSource);
  } finally {
    globalThis.CompressionStream = previousCompressionStream;
  }
});

test("ChromeSyncStorage skips scripts with missing chunks instead of throwing", async () => {
  const previousCompressionStream = globalThis.CompressionStream;
  globalThis.CompressionStream = undefined;

  try {
    const largeSource = `export const blob = ${JSON.stringify(
      "y".repeat(8_000)
    )};`;
    const script = buildUserscriptFixture({
      id: "broken-script",
      code: {
        source: { typescript: largeSource, scss: "" },
        compiled: { javascript: "", css: "" },
      },
    });

    await ChromeSyncStorage.saveScript(script);
    const manifest = mock.store.get("userscript:broken-script");
    assert.equal(manifest.mode, "chunked");

    mock.store.delete("userscript:broken-script:chunk:0");

    const warnings = [];
    const previousWarn = console.warn;
    console.warn = (...args) => {
      warnings.push(args.join(" "));
    };

    try {
      const loaded = await ChromeSyncStorage.getAllScripts();
      assert.equal(loaded["broken-script"], undefined);
      assert.equal(Object.keys(loaded).length, 0);
      assert.match(warnings.join("\n"), /broken-script/);
    } finally {
      console.warn = previousWarn;
    }
  } finally {
    globalThis.CompressionStream = previousCompressionStream;
  }
});

test("ChromeSyncStorage.deleteScript removes manifest and chunk keys", async () => {
  const previousCompressionStream = globalThis.CompressionStream;
  globalThis.CompressionStream = undefined;

  try {
    const largeSource = `export const blob = ${JSON.stringify(
      "z".repeat(8_000)
    )};`;
    const script = buildUserscriptFixture({
      id: "delete-me",
      code: {
        source: { typescript: largeSource, scss: "" },
        compiled: { javascript: "", css: "" },
      },
    });

    await ChromeSyncStorage.saveScript(script);
    const manifest = mock.store.get("userscript:delete-me");
    assert.ok(manifest.chunkCount >= 2);

    await ChromeSyncStorage.deleteScript("delete-me");

    assert.equal(mock.store.has("userscript:delete-me"), false);
    for (let index = 0; index < manifest.chunkCount; index++) {
      assert.equal(
        mock.store.has(`userscript:delete-me:chunk:${index}`),
        false
      );
    }
  } finally {
    globalThis.CompressionStream = previousCompressionStream;
  }
});
