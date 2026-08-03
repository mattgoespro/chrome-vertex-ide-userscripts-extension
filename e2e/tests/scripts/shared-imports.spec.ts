import { test, expect, buildUserscript } from "../../fixtures";
import {
  expectNoModuleImportErrors,
  waitForTypescriptEditorText,
} from "../../helpers/monaco";
import { OptionsPage, ScriptsPage } from "../../pages";

/**
 * Shared-module IntelliSense must stay valid across script switches.
 *
 * Regression for: consumer Y opens with TS2307 on `scripts/<x>/main`, clearing
 * after visiting X, then returning after visiting unrelated shared Z.
 */
test.describe("Scripts — shared module imports", () => {
  test("consumer opens clean and stays clean across script switches", async ({
    optionsPage,
    clearStorage,
    seedStorage,
  }) => {
    const exporter = buildUserscript({
      name: "Logger | Utility",
      moduleName: "logger",
      shared: true,
      sharedScripts: [],
      code: {
        source: {
          typescript: [
            "export function createLogger(name: string) {",
            "  return (...args: unknown[]) => console.log(name, ...args);",
            "}",
          ].join("\n"),
          scss: "",
        },
        compiled: { javascript: "", css: "" },
      },
    });

    const unrelated = buildUserscript({
      name: "Pretty Stringify | Utility",
      moduleName: "pretty-stringify",
      shared: true,
      sharedScripts: [],
      code: {
        source: {
          typescript: [
            "export function prettyStringify(value: unknown): string {",
            "  return JSON.stringify(value, null, 2);",
            "}",
          ].join("\n"),
          scss: "",
        },
        compiled: { javascript: "", css: "" },
      },
    });

    // Deliberately leave sharedScripts empty so IntelliSense must resolve the
    // dependency from the TypeScript import (and keep shared modules resident).
    const consumer = buildUserscript({
      name: "DOM Utils | Utility",
      moduleName: "dom-utils",
      shared: true,
      sharedScripts: [],
      code: {
        source: {
          typescript: [
            'import { createLogger } from "scripts/logger/main";',
            "",
            'const log = createLogger("DOM Utils | Utility");',
            "",
            "export function isParentFrame(window: Window): boolean {",
            "  return window === window.top;",
            "}",
            "",
            "log(isParentFrame(window));",
          ].join("\n"),
          scss: "",
        },
        compiled: { javascript: "", css: "" },
      },
    });

    await clearStorage(optionsPage);
    await seedStorage(optionsPage, {
      [`userscript:${exporter.id}`]: exporter,
      [`userscript:${unrelated.id}`]: unrelated,
      [`userscript:${consumer.id}`]: consumer,
      globalState: {
        activeSidebarTab: "scripts",
        selectedScriptId: consumer.id,
        outputDrawerCollapsed: false,
      },
    });
    await optionsPage.reload();

    const options = new OptionsPage(optionsPage);
    const scripts = new ScriptsPage(optionsPage);

    await options.waitForReady();
    await options.waitForEditorReady();

    await expect(scripts.scriptNameInput).toHaveValue("DOM Utils | Utility", {
      timeout: 15_000,
    });
    await waitForTypescriptEditorText(
      optionsPage,
      'from "scripts/logger/main"'
    );
    await expectNoModuleImportErrors(optionsPage);

    await scripts.selectScript("Logger | Utility", "createLogger");
    await expectNoModuleImportErrors(optionsPage);

    await scripts.selectScript(
      "DOM Utils | Utility",
      'from "scripts/logger/main"'
    );
    await expectNoModuleImportErrors(optionsPage);

    await scripts.selectScript("Pretty Stringify | Utility", "prettyStringify");
    await expectNoModuleImportErrors(optionsPage);

    await scripts.selectScript(
      "DOM Utils | Utility",
      'from "scripts/logger/main"'
    );
    await expectNoModuleImportErrors(optionsPage);
  });
});
