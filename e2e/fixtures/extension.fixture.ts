import {
  chromium,
  test,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import os from "os";
import path from "path";

const EXTENSION_DIST_PATH = path.resolve(import.meta.dirname, "../../dist");

/**
 * Test-scoped fixtures (a new instance per test).
 */
interface ExtensionTestFixtures {
  optionsPage: Page;
  popupPage: Page;
}

/**
 * Worker-scoped fixtures (shared across tests in the same worker).
 */
interface ExtensionWorkerFixtures {
  extensionContext: BrowserContext;
  extensionId: string;
}

export const extensionTest = test.extend<
  ExtensionTestFixtures,
  ExtensionWorkerFixtures
>({
  extensionContext: [
    async ({}, use, workerInfo) => {
      const userDataDir = path.join(
        os.tmpdir(),
        `playwright-ext-${Date.now()}`
      );

      // Prefer Playwright's project headless flag (set by --headed / --headless).
      // Do not read process.argv: workers often never see the CLI flag.
      // Extensions need headed mode or Chrome's --headless=new (not legacy --headless).
      const headless = workerInfo.project.use.headless ?? true;

      const context = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        args: [
          ...(headless ? ["--headless=new"] : []),
          "--no-first-run",
          "--no-default-browser-check",
          `--disable-extensions-except=${EXTENSION_DIST_PATH}`,
          `--load-extension=${EXTENSION_DIST_PATH}`,
        ],
      });

      await use(context);
      await context.close();
    },
    { scope: "test" },
  ],
  extensionId: [
    async ({ extensionContext }, use) => {
      // Prefer an already-registered SW. Avoid leaving a dangling waitForEvent
      // (it rejects when the worker context closes and fails the run).
      let serviceWorker = extensionContext.serviceWorkers()[0];

      if (!serviceWorker) {
        try {
          serviceWorker = await extensionContext.waitForEvent("serviceworker", {
            timeout: 30_000,
          });
        } catch (error) {
          serviceWorker = extensionContext.serviceWorkers()[0];
          if (!serviceWorker) {
            throw error;
          }
        }
      }

      const match = serviceWorker.url().match(/chrome-extension:\/\/([^/]+)/);

      if (!match) {
        throw new Error(
          `[e2e] Could not extract extension ID from service worker URL: ${serviceWorker.url()}`
        );
      }

      await use(match[1]);
    },
    { scope: "test" },
  ],
  optionsPage: async ({ extensionContext, extensionId }, use) => {
    const page = await extensionContext.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);
    // Wait for the sidebar to be visible — reliable for all storage states.
    // Tests/POMs wait for Monaco themselves when they need an editor.
    await page.waitForSelector('[title="Scripts"]', { timeout: 15_000 });
    await use(page);
    await page.close();
  },
  popupPage: async ({ extensionContext, extensionId }, use) => {
    const page = await extensionContext.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await use(page);
    await page.close();
  },
});
