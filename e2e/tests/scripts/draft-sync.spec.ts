import { test, expect, buildUserscript } from "../../fixtures";
import { buildUserscriptSyncManifest } from "../../fixtures/userscript-storage";
import { waitForTypescriptEditorText } from "../../helpers/monaco";
import { OptionsPage, ScriptsPage } from "../../pages";

test.describe("Scripts — draft sync", () => {
  test("saved TypeScript survives hard reload", async ({
    optionsPage,
    clearStorage,
    seedStorage,
  }) => {
    const script = buildUserscript({
      name: "ReloadFidelity",
      code: {
        source: {
          typescript: "export const initial = 1;",
          scss: "",
        },
        compiled: { javascript: "", css: "" },
      },
    });

    await clearStorage(optionsPage);
    await seedStorage(optionsPage, { [`userscript:${script.id}`]: script });
    await optionsPage.reload();

    const options = new OptionsPage(optionsPage);
    const scripts = new ScriptsPage(optionsPage);

    await options.waitForReady();
    await scripts.selectScript("ReloadFidelity");
    await scripts.saveTypescriptCode("export const saved = 42;");

    await optionsPage.reload();
    await options.waitForReady();
    await scripts.selectScript("ReloadFidelity");

    await waitForTypescriptEditorText(optionsPage, "saved = 42");
  });

  test("metadata rename does not overwrite unsaved TypeScript in editor or storage", async ({
    optionsPage,
    clearStorage,
    seedStorage,
  }) => {
    const script = buildUserscript({
      name: "MetadataSafety",
      code: {
        source: {
          typescript: "export const stored = 1;",
          scss: "",
        },
        compiled: { javascript: "", css: "" },
      },
    });

    await clearStorage(optionsPage);
    await seedStorage(optionsPage, { [`userscript:${script.id}`]: script });
    await optionsPage.reload();

    const options = new OptionsPage(optionsPage);
    const scripts = new ScriptsPage(optionsPage);

    await options.waitForReady();
    await scripts.selectScript("MetadataSafety");

    await scripts.replaceTypescriptCode("export const unsaved = 99;");

    await scripts.setScriptName("RenamedMetadataSafety");

    await waitForTypescriptEditorText(optionsPage, "unsaved = 99");

    await optionsPage.reload();
    await options.waitForReady();
    await scripts.selectScript("RenamedMetadataSafety");

    await waitForTypescriptEditorText(optionsPage, "stored = 1");
    const reloadedText = await scripts.getTypescriptEditorText();
    expect(reloadedText).not.toContain("unsaved = 99");
  });

  test("unsaved edits survive switching away and back", async ({
    optionsPage,
    clearStorage,
    seedStorage,
  }) => {
    const first = buildUserscript({
      name: "FirstScript",
      moduleName: "first-script",
      code: {
        source: { typescript: "export const first = 1;", scss: "" },
        compiled: { javascript: "", css: "" },
      },
    });
    const second = buildUserscript({
      name: "SecondScript",
      moduleName: "second-script",
      code: {
        source: { typescript: "export const second = 2;", scss: "" },
        compiled: { javascript: "", css: "" },
      },
    });

    await clearStorage(optionsPage);
    await seedStorage(optionsPage, {
      [`userscript:${first.id}`]: first,
      [`userscript:${second.id}`]: second,
      globalState: {
        activeSidebarTab: "scripts",
        selectedScriptId: first.id,
      },
    });
    await optionsPage.reload();

    const options = new OptionsPage(optionsPage);
    const scripts = new ScriptsPage(optionsPage);

    await options.waitForReady();
    await scripts.selectScript("FirstScript", "first = 1");

    await scripts.replaceTypescriptCode("export const switched = 7;");

    await scripts.selectScript("SecondScript", "second = 2");
    await scripts.selectScript("FirstScript", "switched = 7");

    await waitForTypescriptEditorText(optionsPage, "switched = 7");
  });

  test("external storage change prompts conflict and take-remote applies remote text", async ({
    optionsPage,
    clearStorage,
    seedStorage,
  }) => {
    const script = buildUserscript({
      name: "ConflictScript",
      code: {
        source: {
          typescript: "export const local = 1;",
          scss: "",
        },
        compiled: { javascript: "", css: "" },
      },
    });

    await clearStorage(optionsPage);
    await seedStorage(optionsPage, { [`userscript:${script.id}`]: script });
    await optionsPage.reload();

    const options = new OptionsPage(optionsPage);
    const scripts = new ScriptsPage(optionsPage);

    await options.waitForReady();
    await scripts.selectScript("ConflictScript");

    await scripts.replaceTypescriptCode("export const dirty = 5;");
    await scripts.waitForScriptModified("ConflictScript");

    const remoteScript = {
      ...script,
      code: {
        ...script.code,
        source: {
          ...script.code.source,
          typescript: "export const remote = 9;",
        },
      },
      updatedAt: Date.now(),
    };
    const remoteManifest = buildUserscriptSyncManifest(remoteScript);

    await optionsPage.evaluate(
      async ({ scriptId, manifest }) => {
        const allItems = await chrome.storage.sync.get(null);
        const modernKey = `userscript:${scriptId}`;
        const chunkKeys = Object.keys(allItems).filter((key) =>
          key.startsWith(`${modernKey}:chunk:`)
        );

        await chrome.storage.sync.remove([modernKey, ...chunkKeys]);
        await chrome.storage.sync.set({ [modernKey]: manifest });
      },
      { scriptId: script.id, manifest: remoteManifest }
    );

    await expect(
      optionsPage.getByRole("dialog", { name: "Storage sync conflict" })
    ).toBeVisible({ timeout: 15_000 });

    await optionsPage.getByRole("button", { name: "Take remote" }).click();

    await expect(
      optionsPage.getByRole("dialog", { name: "Storage sync conflict" })
    ).not.toBeVisible({ timeout: 15_000 });

    await waitForTypescriptEditorText(optionsPage, "remote = 9");
  });

  test("external storage change prompts conflict and keep-local persists draft to sync", async ({
    optionsPage,
    clearStorage,
    seedStorage,
  }) => {
    const script = buildUserscript({
      name: "KeepLocalScript",
      code: {
        source: {
          typescript: "export const local = 1;",
          scss: "",
        },
        compiled: { javascript: "", css: "" },
      },
    });

    await clearStorage(optionsPage);
    await seedStorage(optionsPage, { [`userscript:${script.id}`]: script });
    await optionsPage.reload();

    const options = new OptionsPage(optionsPage);
    const scripts = new ScriptsPage(optionsPage);

    await options.waitForReady();
    await scripts.selectScript("KeepLocalScript");

    await scripts.replaceTypescriptCode("export const dirty = 5;");
    await scripts.waitForScriptModified("KeepLocalScript");

    const remoteScript = {
      ...script,
      code: {
        ...script.code,
        source: {
          ...script.code.source,
          typescript: "export const remote = 9;",
        },
      },
      updatedAt: Date.now(),
    };
    const remoteManifest = buildUserscriptSyncManifest(remoteScript);

    await optionsPage.evaluate(
      async ({ scriptId, manifest }) => {
        const allItems = await chrome.storage.sync.get(null);
        const modernKey = `userscript:${scriptId}`;
        const chunkKeys = Object.keys(allItems).filter((key) =>
          key.startsWith(`${modernKey}:chunk:`)
        );

        await chrome.storage.sync.remove([modernKey, ...chunkKeys]);
        await chrome.storage.sync.set({ [modernKey]: manifest });
      },
      { scriptId: script.id, manifest: remoteManifest }
    );

    await expect(
      optionsPage.getByRole("dialog", { name: "Storage sync conflict" })
    ).toBeVisible({ timeout: 15_000 });

    await optionsPage.getByRole("button", { name: "Keep local" }).click();

    await expect(
      optionsPage.getByRole("dialog", { name: "Storage sync conflict" })
    ).not.toBeVisible({ timeout: 15_000 });

    await waitForTypescriptEditorText(optionsPage, "dirty = 5");

    // Hard reload proves keep-local wrote the draft to sync (not clear-only).
    await optionsPage.reload();
    await options.waitForReady();
    await scripts.selectScript("KeepLocalScript");
    await waitForTypescriptEditorText(optionsPage, "dirty = 5");
  });
});
