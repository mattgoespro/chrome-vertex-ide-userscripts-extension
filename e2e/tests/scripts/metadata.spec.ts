import { test, expect, buildUserscript } from "../../fixtures";
import { OptionsPage, ScriptsPage } from "../../pages";

test.describe("Scripts — metadata", () => {
  test("URL pattern is saved and shown after reload", async ({
    optionsPage,
    clearStorage,
    seedStorage,
  }) => {
    const script = buildUserscript({ name: "PatternScript" });
    await clearStorage(optionsPage);
    await seedStorage(optionsPage, { [`userscript:${script.id}`]: script });
    await optionsPage.reload();

    const options = new OptionsPage(optionsPage);
    const scripts = new ScriptsPage(optionsPage);

    await options.waitForReady();
    await scripts.selectScript("PatternScript");
    await scripts.addUrlPattern("https://example.com/*");

    await optionsPage.reload();
    await options.waitForReady();
    // Re-select the script after reload so the metadata panel is rendered
    await scripts.selectScript("PatternScript");

    // The URL pattern toggle should show the saved pattern count and summary
    const toggle = optionsPage.locator("button").filter({ hasText: /urls:/ });
    await expect(toggle).toContainText("example.com", { timeout: 10_000 });
  });

  test("seeding a script with URL patterns shows them immediately", async ({
    optionsPage,
    clearStorage,
    seedStorage,
  }) => {
    const script = buildUserscript({
      name: "PatternsPreseeded",
      urlPatterns: ["https://example.com/*", "https://github.com/*"],
    });
    await clearStorage(optionsPage);
    await seedStorage(optionsPage, { [`userscript:${script.id}`]: script });
    await optionsPage.reload();

    const options = new OptionsPage(optionsPage);
    const scripts = new ScriptsPage(optionsPage);

    await options.waitForReady();
    await scripts.selectScript("PatternsPreseeded");

    // The toggle button should show a count
    const toggle = optionsPage.locator("button").filter({ hasText: /urls:/ });
    await expect(toggle).toContainText("[2]");
  });

  test("script marked as shared shows module name field", async ({
    optionsPage,
    clearStorage,
    seedStorage,
  }) => {
    const script = buildUserscript({
      name: "SharedScript",
      shared: true,
      moduleName: "my-module",
    });
    await clearStorage(optionsPage);
    await seedStorage(optionsPage, { [`userscript:${script.id}`]: script });
    await optionsPage.reload();

    const options = new OptionsPage(optionsPage);
    const scripts = new ScriptsPage(optionsPage);

    await options.waitForReady();
    await scripts.selectScript("SharedScript");
    await scripts.openOptionsPanel();

    const moduleNameInput = optionsPage.getByPlaceholder("module-name");
    await expect(moduleNameInput).toBeVisible();
    await expect(moduleNameInput).toHaveValue("my-module");
  });

  test("runAt can be changed in script options and persists", async ({
    optionsPage,
    clearStorage,
    seedStorage,
  }) => {
    const script = buildUserscript({
      name: "RunAtScript",
      runAt: "beforePageLoad",
      enabled: true,
      urlPatterns: ["https://example.com/*"],
    });
    await clearStorage(optionsPage);
    await seedStorage(optionsPage, { [`userscript:${script.id}`]: script });
    await optionsPage.reload();

    const options = new OptionsPage(optionsPage);
    const scripts = new ScriptsPage(optionsPage);

    await options.waitForReady();
    await scripts.selectScript("RunAtScript");
    await expect(optionsPage.getByTestId("script-setup-banner")).toHaveCount(0);
    await scripts.openOptionsPanel();

    const runAtSelect = optionsPage.getByTestId("run-at-select");
    await runAtSelect.locator("button").first().click();
    await runAtSelect
      .locator("button")
      .filter({ hasText: "After page load" })
      .click();

    await expect(
      runAtSelect.locator("button").first()
    ).toContainText("After page load", { timeout: 10_000 });

    await optionsPage.reload();
    await options.waitForReady();
    await scripts.selectScript("RunAtScript");
    await scripts.openOptionsPanel();
    await expect(
      optionsPage.getByTestId("run-at-select").locator("button").first()
    ).toContainText("After page load", { timeout: 10_000 });
  });

  test("new script without patterns shows setup banner", async ({
    optionsPage,
    clearStorage,
  }) => {
    await clearStorage(optionsPage);
    await optionsPage.reload();

    const options = new OptionsPage(optionsPage);
    const scripts = new ScriptsPage(optionsPage);

    await options.waitForReady();
    await scripts.createScript();
    await expect(optionsPage.getByTestId("script-setup-banner")).toBeVisible();
  });
});
