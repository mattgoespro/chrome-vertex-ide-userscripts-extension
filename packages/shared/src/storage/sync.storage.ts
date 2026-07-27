import {
  Userscripts,
  GlobalModules,
  EditorSettings,
  Userscript,
  GlobalModule,
} from "../model";
import {
  hydrateUserscript,
  serializeUserscript,
  type StoredUserscriptPayload,
} from "./userscript-payload";

type StoredUserscriptEncoding = "gzip-base64" | "utf8-base64";

type StoredUserscriptManifest =
  | {
      version: 2;
      encoding: StoredUserscriptEncoding;
      mode: "inline";
      data: string;
    }
  | {
      version: 2;
      encoding: StoredUserscriptEncoding;
      mode: "chunked";
      chunkCount: number;
    };

const USERSCRIPT_KEY_PREFIX = "userscript:";
const USERSCRIPT_CHUNK_SEPARATOR = ":chunk:";
const USERSCRIPT_STORAGE_VERSION = 2;
const USERSCRIPT_INLINE_DATA_LIMIT = 6000;

export class ChromeSyncStorage {
  public static readonly defaultSettings: EditorSettings = {
    theme: "invert-dark",
    appTheme: "graphite",
    fontSize: 11,
    tabSize: 2,
    autoFormat: true,
    minifyCompiledOutput: false,
  };

  static async getAll(): Promise<{
    userscripts: Userscripts;
    globalModules: GlobalModules;
    editorSettings: EditorSettings;
  }> {
    const [userscripts, globalModules, editorSettings] = await Promise.all([
      this.getAllScripts(),
      this.getAllModules(),
      this.getEditorSettings(),
    ]);

    return {
      userscripts,
      globalModules,
      editorSettings,
    };
  }

  /**
   * Reads all userscripts from `chrome.storage.sync`.
   *
   * Userscript payloads are stored per script as compressed manifests to avoid
   * Chrome sync's 8KB-per-item quota.
   */
  static async getAllScripts(): Promise<Userscripts> {
    const allItems = await chrome.storage.sync.get(null);
    const scripts: Userscripts = {};

    const manifestEntries: Array<[string, unknown]> = [];

    for (const key of Object.keys(allItems)) {
      if (this.isUserscriptManifestKey(key)) {
        manifestEntries.push([key, allItems[key]]);
      }
    }

    const hydratedScripts = await Promise.all(
      manifestEntries.map(async ([key, value]) => {
        const scriptId = this.parseUserscriptIdFromManifestKey(key);

        if (!scriptId) {
          return null;
        }

        try {
          return await this.readUserscriptFromStoredValue(
            scriptId,
            value as StoredUserscriptManifest,
            allItems
          );
        } catch (error) {
          console.warn(
            `Failed to load userscript '${scriptId}' from chrome.storage.sync.`,
            error
          );
          return null;
        }
      })
    );

    for (const script of hydratedScripts) {
      if (script) {
        scripts[script.id] = script;
      }
    }

    return scripts;
  }

  static async saveScript(script: Userscript): Promise<void> {
    await this.writeUserscript(script);
  }

  static async updateScript(
    id: string,
    updates: Partial<Omit<Userscript, "id">>
  ): Promise<void> {
    const script = await this.getScript(id);

    if (!script) {
      throw new Error(`Userscript with ID '${id}' not found.`);
    }

    const updatedScript = { ...script, ...updates };

    await this.writeUserscript(updatedScript);
  }

  static async deleteScript(scriptId: string): Promise<void> {
    const key = this.getUserscriptStorageKey(scriptId);
    const result = await chrome.storage.sync.get(key);
    const manifest = result[key] as StoredUserscriptManifest | undefined;
    const keysToRemove = [
      key,
      ...this.getChunkKeysForManifest(scriptId, manifest),
    ];

    await chrome.storage.sync.remove(keysToRemove);
  }

  static async getAllModules(): Promise<GlobalModules> {
    const result = await chrome.storage.sync.get<{
      globalModules: GlobalModules;
    }>(["globalModules"]);
    return result.globalModules ?? {};
  }

  static async saveModule(module: GlobalModule): Promise<void> {
    const allModules = await this.getAllModules();

    allModules[module.id] = module;

    await chrome.storage.sync.set({ globalModules: allModules });
  }

  static async deleteModule(moduleId: string): Promise<void> {
    const allModules = await this.getAllModules();
    delete allModules[moduleId];
    await chrome.storage.sync.set({ globalModules: allModules });
  }

  static async getEditorSettings(): Promise<EditorSettings> {
    const result = await chrome.storage.sync.get<{
      editorSettings: EditorSettings;
    }>(["editorSettings"]);
    return { ...this.defaultSettings, ...result.editorSettings };
  }

  static async saveEditorSettings(
    editorSettings: Partial<EditorSettings>
  ): Promise<void> {
    const current = await this.getEditorSettings();
    await chrome.storage.sync.set({
      editorSettings: { ...current, ...editorSettings },
    });
  }

  private static async getScript(scriptId: string): Promise<Userscript | null> {
    const key = this.getUserscriptStorageKey(scriptId);
    const result = await chrome.storage.sync.get(key);
    const manifest = result[key] as StoredUserscriptManifest | undefined;

    if (!manifest) {
      const allScripts = await this.getAllScripts();
      return allScripts[scriptId] ?? null;
    }

    const chunkKeys = this.getChunkKeysForManifest(scriptId, manifest);
    const chunkValues =
      chunkKeys.length > 0 ? await chrome.storage.sync.get(chunkKeys) : {};

    return this.readUserscriptFromStoredValue(scriptId, manifest, chunkValues);
  }

  private static async writeUserscript(script: Userscript): Promise<void> {
    const key = this.getUserscriptStorageKey(script.id);
    const existingResult = await chrome.storage.sync.get(key);
    const existingManifest = existingResult[key] as
      | StoredUserscriptManifest
      | undefined;
    const staleChunkKeys = this.getChunkKeysForManifest(
      script.id,
      existingManifest
    );
    const { manifest, chunkEntries } =
      await this.buildStoredUserscriptEntries(script);

    await chrome.storage.sync.set({
      [key]: manifest,
      ...chunkEntries,
    });

    const nextChunkKeys = Object.keys(chunkEntries);
    const keysToRemove = staleChunkKeys.filter(
      (chunkKey) => nextChunkKeys.indexOf(chunkKey) === -1
    );

    if (keysToRemove.length > 0) {
      await chrome.storage.sync.remove(keysToRemove);
    }
  }

  private static async buildStoredUserscriptEntries(
    script: Userscript
  ): Promise<{
    manifest: StoredUserscriptManifest;
    chunkEntries: Record<string, string>;
  }> {
    const payload = JSON.stringify(serializeUserscript(script));
    const encoded = await this.encodePayload(payload);

    if (encoded.data.length <= USERSCRIPT_INLINE_DATA_LIMIT) {
      return {
        manifest: {
          version: USERSCRIPT_STORAGE_VERSION,
          encoding: encoded.encoding,
          mode: "inline",
          data: encoded.data,
        },
        chunkEntries: {},
      };
    }

    const chunks = this.chunkEncodedPayload(encoded.data);
    const chunkEntries: Record<string, string> = {};

    for (let index = 0; index < chunks.length; index++) {
      chunkEntries[this.getUserscriptChunkKey(script.id, index)] =
        chunks[index];
    }

    return {
      manifest: {
        version: USERSCRIPT_STORAGE_VERSION,
        encoding: encoded.encoding,
        mode: "chunked",
        chunkCount: chunks.length,
      },
      chunkEntries,
    };
  }

  private static async readUserscriptFromStoredValue(
    scriptId: string,
    manifest: StoredUserscriptManifest,
    storageValues: Record<string, unknown>
  ): Promise<Userscript> {
    const payload = await this.readStoredUserscriptPayload(
      scriptId,
      manifest,
      storageValues
    );

    return hydrateUserscript(scriptId, payload);
  }

  private static async readStoredUserscriptPayload(
    scriptId: string,
    manifest: StoredUserscriptManifest,
    storageValues: Record<string, unknown>
  ): Promise<StoredUserscriptPayload> {
    const encodedPayload =
      manifest.mode === "inline"
        ? manifest.data
        : this.getChunkKeysForManifest(scriptId, manifest)
            .map((chunkKey) => {
              const chunkValue = storageValues[chunkKey];

              if (typeof chunkValue !== "string") {
                throw new Error(
                  `Missing userscript payload chunk '${chunkKey}'.`
                );
              }

              return chunkValue;
            })
            .join("");

    const json = await this.decodePayload(encodedPayload, manifest.encoding);

    return JSON.parse(json) as StoredUserscriptPayload;
  }

  private static getUserscriptStorageKey(scriptId: string): string {
    return `${USERSCRIPT_KEY_PREFIX}${scriptId}`;
  }

  private static getUserscriptChunkKey(
    scriptId: string,
    index: number
  ): string {
    return `${this.getUserscriptStorageKey(scriptId)}${USERSCRIPT_CHUNK_SEPARATOR}${index}`;
  }

  private static getChunkKeysForManifest(
    scriptId: string,
    manifest?: StoredUserscriptManifest
  ): string[] {
    if (!manifest || manifest.mode !== "chunked") {
      return [];
    }

    return Array.from({ length: manifest.chunkCount }, (_, index) =>
      this.getUserscriptChunkKey(scriptId, index)
    );
  }

  private static isUserscriptManifestKey(key: string): boolean {
    return (
      key.startsWith(USERSCRIPT_KEY_PREFIX) &&
      !key.includes(USERSCRIPT_CHUNK_SEPARATOR)
    );
  }

  private static parseUserscriptIdFromManifestKey(key: string): string | null {
    if (!this.isUserscriptManifestKey(key)) {
      return null;
    }

    return key.slice(USERSCRIPT_KEY_PREFIX.length);
  }

  private static chunkEncodedPayload(payload: string): string[] {
    const chunks: string[] = [];

    for (
      let index = 0;
      index < payload.length;
      index += USERSCRIPT_INLINE_DATA_LIMIT
    ) {
      chunks.push(payload.slice(index, index + USERSCRIPT_INLINE_DATA_LIMIT));
    }

    return chunks;
  }

  private static async encodePayload(payload: string): Promise<{
    encoding: StoredUserscriptEncoding;
    data: string;
  }> {
    const utf8Bytes = new TextEncoder().encode(payload);

    if (typeof CompressionStream === "undefined") {
      return {
        encoding: "utf8-base64",
        data: this.bytesToBase64(utf8Bytes),
      };
    }

    const compressedBytes = await this.readStreamBytes(
      new Blob([utf8Bytes]).stream().pipeThrough(new CompressionStream("gzip"))
    );

    return {
      encoding: "gzip-base64",
      data: this.bytesToBase64(compressedBytes),
    };
  }

  private static async decodePayload(
    payload: string,
    encoding: StoredUserscriptEncoding
  ): Promise<string> {
    let bytes = this.base64ToBytes(payload);

    if (encoding === "gzip-base64") {
      if (typeof DecompressionStream === "undefined") {
        throw new Error(
          "DecompressionStream is not available in this Chrome extension context."
        );
      }

      bytes = await this.readStreamBytes(
        new Blob([this.toArrayBuffer(bytes)])
          .stream()
          .pipeThrough(new DecompressionStream("gzip"))
      );
    }

    return new TextDecoder().decode(bytes);
  }

  private static async readStreamBytes(
    stream: ReadableStream<Uint8Array>
  ): Promise<Uint8Array> {
    const buffer = await new Response(stream).arrayBuffer();
    return new Uint8Array(buffer);
  }

  private static toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    return new Uint8Array(bytes).buffer;
  }

  private static bytesToBase64(bytes: Uint8Array): string {
    let binary = "";
    const chunkSize = 0x8000;

    for (let index = 0; index < bytes.length; index += chunkSize) {
      const chunk = bytes.subarray(index, index + chunkSize);
      binary += String.fromCharCode(...chunk);
    }

    return btoa(binary);
  }

  private static base64ToBytes(value: string): Uint8Array {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index++) {
      bytes[index] = binary.charCodeAt(index);
    }

    return bytes;
  }
}
