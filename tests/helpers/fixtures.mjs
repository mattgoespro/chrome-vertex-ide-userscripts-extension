/**
 * Minimal userscript / module fixtures for unit tests.
 */

export function buildUserscriptFixture(overrides = {}) {
  const now = 1_700_000_000_000;

  return {
    id: "script-1",
    name: "Test Script",
    enabled: true,
    status: "saved",
    shared: false,
    moduleName: "test-script",
    sharedScripts: [],
    globalModules: [],
    typeDefinitions: "",
    code: {
      source: {
        typescript: "export {};",
        scss: "",
      },
      compiled: {
        javascript: "console.log(1);",
        css: "",
      },
    },
    urlPatterns: ["https://example.com/*"],
    runAt: "afterPageLoad",
    createdAt: now,
    updatedAt: now,
    ...overrides,
    code: {
      source: {
        typescript: "export {};",
        scss: "",
        ...(overrides.code?.source ?? {}),
      },
      compiled: {
        javascript: "console.log(1);",
        css: "",
        ...(overrides.code?.compiled ?? {}),
      },
    },
  };
}

export function buildModuleFixture(overrides = {}) {
  return {
    id: "mod-1",
    name: "Lodash",
    url: "https://cdn.example.com/lodash.js",
    enabled: true,
    packageName: "lodash",
    ...overrides,
  };
}
