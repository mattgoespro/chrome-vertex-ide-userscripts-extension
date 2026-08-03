import { expect, type Locator, type Page } from "@playwright/test";

export function editorNeedle(code: string): string {
  const match = code.match(/export\s+const\s+(\w+)\s*=\s*([^;]+)/);
  if (match) {
    return `${match[1]} = ${match[2].trim()}`;
  }

  return code.trim();
}
export function normalizeMonacoText(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function typescriptEditor(page: Page) {
  return page
    .locator("[data-testid='typescript-source'] .monaco-editor")
    .first();
}

export async function replaceMonacoEditorContent(
  editor: Locator,
  code: string
) {
  await editor.click();
  await editor.page().keyboard.press("Control+a");
  await editor.page().keyboard.type(code, { delay: 5 });
}

/**
 * Trigger the CodeEditor Ctrl+S handler. Playwright's keyboard shortcut does
 * not always reach the editor root listener, so dispatch the event directly.
 */
export async function saveMonacoEditor(page: Page) {
  await page.evaluate(() => {
    const monacoEditor = document.querySelector(
      "[data-testid='typescript-source'] .monaco-editor"
    );
    const editorRoot = monacoEditor?.parentElement;

    if (!editorRoot) {
      throw new Error("[e2e] Could not find TypeScript editor root element.");
    }

    editorRoot.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "s",
        code: "KeyS",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      })
    );
  });
}

export async function readTypescriptEditorText(page: Page): Promise<string> {
  const text = await page
    .locator("[data-testid='typescript-source'] .view-lines")
    .innerText();
  return normalizeMonacoText(text);
}

export async function waitForTypescriptEditorText(
  page: Page,
  substring: string,
  timeout = 15_000
) {
  await expect
    .poll(async () => readTypescriptEditorText(page), { timeout })
    .toContain(substring);
}

/** Expand the script editor problems drawer so error messages are in the DOM. */
export async function expandProblemsDrawer(page: Page) {
  const expand = page.getByTitle("Expand drawer");
  if (await expand.isVisible().catch(() => false)) {
    await expand.click();
  }
  await expect(page.getByTitle("Collapse drawer")).toBeVisible({
    timeout: 15_000,
  });

  await page.getByText("problems", { exact: true }).click();
}

/**
 * Assert the visible script has no "Cannot find module" diagnostics.
 *
 * Monaco's TS worker can report a clean panel briefly before markers arrive,
 * so we require several consecutive clean polls after the panel has a settled
 * message ("No errors or warnings" or any non-module diagnostic).
 */
export async function expectNoModuleImportErrors(
  page: Page,
  timeout = 20_000
) {
  await expandProblemsDrawer(page);

  const problems = page.locator("[data-testid='output-drawer']");
  const deadline = Date.now() + timeout;
  let cleanStreak = 0;
  const requiredStreak = 4;

  while (Date.now() < deadline) {
    const text = await problems.innerText();
    const hasImportError = /Cannot find module/i.test(text);
    const settled =
      /No errors or warnings/i.test(text) || /Line\s+\d+:\d+/i.test(text);

    if (hasImportError) {
      cleanStreak = 0;
    } else if (settled) {
      cleanStreak += 1;
      if (cleanStreak >= requiredStreak) {
        return;
      }
    } else {
      cleanStreak = 0;
    }

    await page.waitForTimeout(350);
  }

  const finalText = await problems.innerText();
  throw new Error(
    `Timed out waiting for shared-module imports to resolve.\nProblems panel:\n${finalText}`
  );
}
