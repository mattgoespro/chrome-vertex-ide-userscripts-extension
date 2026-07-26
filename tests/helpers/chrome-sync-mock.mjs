/**
 * Minimal in-memory chrome.storage.sync mock for ChromeSyncStorage unit tests.
 */
export function installChromeSyncMock() {
  const store = new Map();

  const sync = {
    async get(keys) {
      if (keys == null) {
        return Object.fromEntries(store.entries());
      }

      if (typeof keys === "string") {
        return store.has(keys) ? { [keys]: store.get(keys) } : {};
      }

      if (Array.isArray(keys)) {
        const result = {};
        for (const key of keys) {
          if (store.has(key)) {
            result[key] = store.get(key);
          }
        }
        return result;
      }

      const result = {};
      for (const key of Object.keys(keys)) {
        result[key] = store.has(key) ? store.get(key) : keys[key];
      }
      return result;
    },

    async set(items) {
      for (const [key, value] of Object.entries(items)) {
        store.set(key, value);
      }
    },

    async remove(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      for (const key of list) {
        store.delete(key);
      }
    },

    async clear() {
      store.clear();
    },
  };

  globalThis.chrome = {
    storage: {
      sync,
    },
  };

  return {
    store,
    sync,
    reset() {
      store.clear();
    },
  };
}

export function buildUserscriptFixture(overrides = {}) {
  const now = Date.now();

  return {
    id: "script-1",
    name: "Fixture Script",
    enabled: true,
    status: "saved",
    shared: false,
    moduleName: "fixture-script",
    sharedScripts: [],
    globalModules: [],
    typeDefinitions: "",
    code: {
      source: {
        typescript: "export const value = 1;",
        scss: "",
      },
      compiled: {
        javascript: "",
        css: "",
      },
    },
    urlPatterns: ["https://example.com/*"],
    runAt: "afterPageLoad",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
