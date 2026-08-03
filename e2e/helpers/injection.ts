import type { BrowserContext, Page } from "@playwright/test";
import { expect } from "../fixtures";
import type { Userscript } from "@shared/model";

export type CompiledSeed = {
  javascript: string;
  css: string;
  build?: { version: 1; minifyCompiledOutput: boolean };
};

export function buildCompiledLocalEntry(
  scriptId: string,
  entry: CompiledSeed
): Record<string, CompiledSeed> {
  return {
    [`compiled:${scriptId}`]: {
      build: { version: 1, minifyCompiledOutput: false },
      ...entry,
    },
  };
}

export async function openContentTab(
  context: BrowserContext,
  url: string
): Promise<Page> {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  return page;
}

export async function readHtmlOpacity(page: Page): Promise<string> {
  return page.evaluate(() =>
    getComputedStyle(document.documentElement).opacity
  );
}

export async function readInvertMarker(page: Page): Promise<string | null> {
  return page.evaluate(() =>
    document.documentElement.getAttribute("data-invert")
  );
}

export async function waitForInvertMarker(
  page: Page,
  expected: string | null,
  timeout = 15_000
): Promise<void> {
  await expect
    .poll(async () => readInvertMarker(page), { timeout })
    .toBe(expected);
}

export async function waitForHtmlOpacity(
  page: Page,
  expected: string,
  timeout = 15_000
): Promise<void> {
  await expect
    .poll(async () => readHtmlOpacity(page), { timeout })
    .toBe(expected);
}

/** Re-apply scripts from the options page (extension origin). */
export async function sendApplyScripts(
  optionsPage: Page,
  scriptIds: string[]
): Promise<void> {
  await optionsPage.evaluate(async (ids) => {
    await chrome.runtime.sendMessage({
      source: "options",
      type: "applyScripts",
      data: { scriptIds: ids },
    });
  }, scriptIds);
}

export function matchingExampleScript(
  overrides: Partial<Userscript> = {}
): Partial<Userscript> {
  return {
    enabled: false,
    shared: false,
    moduleName: "",
    urlPatterns: ["https://example.com/*"],
    runAt: "afterPageLoad",
    ...overrides,
  };
}
