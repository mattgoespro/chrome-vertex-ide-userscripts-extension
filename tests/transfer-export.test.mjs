import assert from "node:assert/strict";
import test from "node:test";
import {
  buildUserscriptsTransferFile,
  stringifyUserscriptsTransferFile,
  validateUserscriptsTransferFile,
} from "../packages/renderer/src/shared/store/slices/userscripts/transfer.userscripts.ts";
import { buildUserscriptFixture } from "./helpers/fixtures.mjs";

test("buildUserscriptsTransferFile exports scripts sorted by createdAt with derived sharedImports", () => {
  const newer = buildUserscriptFixture({
    id: "newer",
    name: "Newer",
    createdAt: 200,
    moduleName: "newer",
    globalModules: ["mod-1"],
    typeDefinitions: "export type Newer = string;",
    code: {
      source: {
        typescript: `import { util } from "scripts/util/main";\nexport const n = 1;`,
        scss: ".newer {}",
      },
    },
  });
  const older = buildUserscriptFixture({
    id: "older",
    name: "Older",
    createdAt: 100,
    moduleName: "older",
    shared: true,
    urlPatterns: ["https://example.com/*"],
    runAt: "beforePageLoad",
    code: {
      source: {
        typescript: "export const older = true;",
        scss: "",
      },
    },
  });

  const file = buildUserscriptsTransferFile({
    newer,
    older,
  });

  assert.equal(file.title, "Userscripts");
  assert.ok(file.$schema);
  assert.equal(file.userscripts.length, 2);
  assert.equal(file.userscripts[0].name, "Older");
  assert.equal(file.userscripts[1].name, "Newer");
  assert.deepEqual(file.userscripts[0], {
    name: "Older",
    enabled: true,
    urlPatterns: ["https://example.com/*"],
    runAt: "beforePageLoad",
    moduleName: "older",
    sources: {
      typescript: "export const older = true;",
      "typescript-declarations": "",
      scss: "",
    },
    sharedImports: [],
    globalModuleImports: [],
  });
  assert.deepEqual(file.userscripts[1].sharedImports, ["util"]);
  assert.deepEqual(file.userscripts[1].globalModuleImports, ["mod-1"]);
  assert.equal(
    file.userscripts[1].sources["typescript-declarations"],
    "export type Newer = string;"
  );
  assert.equal(
    file.userscripts[1].sources.typescript,
    `import { util } from "scripts/util/main";\nexport const n = 1;`
  );
  assert.equal(file.userscripts[1].sources.scss, ".newer {}");
});

test("buildUserscriptsTransferFile round-trips through stringify and validate", () => {
  const shared = buildUserscriptFixture({
    id: "shared-1",
    name: "Shared Util",
    createdAt: 1,
    shared: true,
    moduleName: "util",
    code: {
      source: {
        typescript: "export const util = 1;",
        scss: "",
      },
    },
  });
  const consumer = buildUserscriptFixture({
    id: "consumer-1",
    name: "Consumer",
    createdAt: 2,
    moduleName: "consumer",
    code: {
      source: {
        typescript: `import { util } from "scripts/util/main";\nexport const c = util;`,
        scss: "",
      },
    },
  });

  const exported = buildUserscriptsTransferFile({
    "shared-1": shared,
    "consumer-1": consumer,
  });
  const json = stringifyUserscriptsTransferFile(exported);
  const parsed = JSON.parse(json);
  const validated = validateUserscriptsTransferFile(parsed, {
    existingSharedModuleNames: [],
  });

  assert.equal(typeof json, "string");
  assert.match(json, /"title": "Userscripts"/);
  assert.deepEqual(validated.errors, []);
  assert.ok(validated.file);
  assert.equal(validated.file.userscripts.length, 2);
  assert.deepEqual(
    validated.file.userscripts.map((entry) => entry.moduleName),
    ["util", "consumer"]
  );
  assert.deepEqual(validated.file.userscripts[1].sharedImports, ["util"]);
});
