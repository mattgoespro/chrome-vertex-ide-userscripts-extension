import { expect, type Page } from "@playwright/test";
import {
  editorNeedle,
  readTypescriptEditorText,
  replaceMonacoEditorContent,
  saveMonacoEditor,
  typescriptEditor,
  waitForTypescriptEditorText,
} from "../helpers/monaco";

/**
 * Page Object Model for the Scripts page (sidebar tab "Scripts" in Options).
 *
 * Assumes the page is already on options.html with the Scripts tab active.
 */
export class ScriptsPage {
  constructor(readonly page: Page) {}

  private scriptRow(name: string) {
    return this.scriptListPanel
      .locator("div.group")
      .filter({ has: this.page.getByText(name, { exact: true }) })
      .first();
  }

  // ─── Script List ──────────────────────────────────────────────────────────

  /** The sidebar panel containing the script list. */
  get scriptListPanel() {
    // react-resizable-panels v4 renders id and data-testid (not data-panel-id)
    return this.page.locator("[data-testid='scripts-sidebar']");
  }

  /** Create a new script and wait for it to appear in the list. */
  async createScript() {
    // Count current checkboxes before creating so each call reliably waits
    // for its own new script — .first() would immediately resolve for call 2+.
    const before = await this.scriptListPanel
      .locator("input[type='checkbox']")
      .count();
    await this.page.getByTitle("Create new script").click();
    await expect(
      this.scriptListPanel.locator("input[type='checkbox']")
    ).toHaveCount(before + 1, { timeout: 15_000 });
  }

  /**
   * Click a script in the list by name. Scoped to the sidebar panel to avoid
   * matching the script name appearing elsewhere on the page.
   */
  /**
   * Click a script in the list by name. Scoped to the sidebar panel to avoid
   * matching the script name appearing elsewhere on the page.
   * @param expectedEditorSnippet When provided, waits for the TypeScript editor
   *   to reflect the selected script before returning.
   */
  async selectScript(name: string, expectedEditorSnippet?: string) {
    await this.scriptListPanel.getByText(name, { exact: true }).click();
    await expect(this.scriptNameInput).toHaveValue(name, { timeout: 15_000 });
    await expect(
      this.scriptListPanel
        .locator(".border-l-accent")
        .getByText(name, { exact: true })
    ).toBeVisible({ timeout: 15_000 });
    await this.page.waitForSelector(
      "[data-testid='typescript-source'] .monaco-editor .view-lines",
      { timeout: 15_000 }
    );

    if (expectedEditorSnippet) {
      await waitForTypescriptEditorText(this.page, expectedEditorSnippet);
    }
  }

  /** Get all script names currently shown in the list. */
  async getScriptNames(): Promise<string[]> {
    // Script name spans have overflow-hidden (unique to ScriptListItem name spans,
    // excludes the '//' decoration span in the header)
    const spans = this.scriptListPanel.locator(
      "span[class*='overflow-hidden']"
    );
    return spans.allTextContents();
  }

  /** Toggle the enabled/disabled switch for a script by name. */
  async toggleScript(name: string) {
    const item = this.scriptRow(name);
    const checkbox = item.locator("input[type='checkbox']");
    const slider = item.locator("label.switch--wrapper .switch--slider");
    const wasChecked = await checkbox.isChecked();
    const expectEnabled = !wasChecked;

    await slider.click({ force: true });

    // Wait for the toggleUserscript thunk to persist to chrome.storage.sync.
    // Sync omits `enabled` when false, so treat a missing flag as disabled.
    await this.page.waitForFunction(
      async ({ scriptName, enabled }) => {
        const data = await chrome.storage.sync.get(null);

        for (const [key, value] of Object.entries(data)) {
          if (!key.startsWith("userscript:") || key.includes(":chunk:")) {
            continue;
          }

          const entry = value as { data?: string; encoding?: string };

          if (entry?.encoding !== "utf8-base64" || !entry.data) {
            continue;
          }

          const json = JSON.parse(atob(entry.data)) as {
            name?: string;
            enabled?: true;
          };

          if (json.name === scriptName) {
            return (json.enabled === true) === enabled;
          }
        }

        return false;
      },
      { scriptName: name, enabled: expectEnabled },
      { timeout: 15_000 }
    );
  }

  /** Check whether the script's modified pulse indicator is visible. */
  async isScriptModified(name: string): Promise<boolean> {
    const item = this.scriptRow(name);
    return item.locator(".animate-pulse-indicator").isVisible();
  }

  /** Wait until the script's modified pulse indicator appears. */
  async waitForScriptModified(name: string) {
    const item = this.scriptRow(name);
    await expect(item.locator(".animate-pulse-indicator")).toBeVisible({
      timeout: 15_000,
    });
  }

  // ─── Script Metadata ──────────────────────────────────────────────────────

  /** The name input in the editor toolbar. */
  get scriptNameInput() {
    return this.page.getByPlaceholder("Script name...");
  }

  /** Change the script name. Uses `fill` to replace the value entirely. */
  async setScriptName(name: string) {
    await this.scriptNameInput.fill(name);
    await this.scriptNameInput.press("Tab");
    // Wait for the updateUserscript thunk to complete: the sidebar reflects the new
    // name only after the fulfilled action updates Redux state.
    await expect(this.scriptListPanel).toContainText(name, { timeout: 15_000 });
  }

  /** Open the URL pattern dropdown, add a pattern, and wait for it to be saved. */
  async addUrlPattern(pattern: string) {
    // Click the toggle button to open the dropdown
    const toggle = this.page.locator("button").filter({ hasText: /urls:/ });
    await toggle.click();

    // The dropdown input placeholder changes based on count
    const input = this.page
      .getByPlaceholder("https://*.example.com/* — Enter to add")
      .or(this.page.getByPlaceholder("Add pattern..."));

    await input.fill(pattern);
    await input.press("Enter");

    // Wait for the updateUserscript thunk to complete:
    // the [N] count badge in the toggle only appears after Redux processes
    // the fulfilled action (storage write has completed).
    await expect(toggle).toContainText("[", { timeout: 15_000 });
  }

  // ─── Options Panel ────────────────────────────────────────────────────────

  /** Open the ⋮ script options panel. */
  async openOptionsPanel() {
    await this.page.getByTitle("Script options").click();
  }

  /** Close the options panel by pressing Escape. */
  async closeOptionsPanel() {
    await this.page.keyboard.press("Escape");
  }

  /** Set the module name for sharing (opens options panel, fills field, closes). */
  async setModuleName(moduleName: string) {
    await this.openOptionsPanel();
    const input = this.page.getByPlaceholder("module-name");
    await input.fill(moduleName);
    await input.press("Tab");
  }

  /**
   * Delete the currently-selected script.
   * Accepts the confirm() dialog automatically.
   */
  async deleteCurrentScript() {
    this.page.on("dialog", (dialog) => dialog.accept());
    await this.openOptionsPanel();
    await this.page.getByRole("button", { name: /Delete script/i }).click();
  }

  // ─── Code Editors ────────────────────────────────────────────────────────

  /** Type into the TypeScript editor and save with Ctrl+S. */
  async saveTypescriptCode(code: string) {
    const editor = typescriptEditor(this.page);
    await replaceMonacoEditorContent(editor, code);
    await saveMonacoEditor(this.page);

    await this.page.waitForFunction(
      async ({ expected }) => {
        const data = await chrome.storage.sync.get(null);
        const scriptKey = Object.keys(data).find(
          (key) => key.startsWith("userscript:") && !key.includes(":chunk:")
        );

        if (!scriptKey) {
          return false;
        }

        const entry = data[scriptKey] as
          | { data?: string; encoding?: string }
          | undefined;

        if (!entry?.data || entry.encoding !== "utf8-base64") {
          return false;
        }

        const json = atob(entry.data);
        return json.includes(expected);
      },
      { expected: code.replace(/\s+/g, " ").trim() },
      { timeout: 15_000 }
    );
  }

  /** Replace TypeScript editor contents without saving. */
  async replaceTypescriptCode(code: string) {
    const editor = typescriptEditor(this.page);
    await replaceMonacoEditorContent(editor, code);
    const needle = editorNeedle(code);
    await waitForTypescriptEditorText(this.page, needle);
  }

  /** Read the TypeScript editor's visible source text. */
  async getTypescriptEditorText() {
    return readTypescriptEditorText(this.page);
  }

  // ─── Compiled Output Drawer ───────────────────────────────────────────────

  /** Click a drawer tab: "javascript", "css", or "errors". */
  async clickDrawerTab(tab: "javascript" | "css" | "errors") {
    await this.page
      .locator("[data-testid='output-drawer']")
      .getByText(tab, { exact: false })
      .first()
      .click();
  }

  /** Read the text content of the compiled output in the drawer. */
  async getCompiledOutput(): Promise<string> {
    const drawer = this.page.locator("[data-panel-id='output-drawer']");
    // Read visible Monaco editor lines
    const lines = drawer.locator(".view-line");
    return (await lines.allTextContents()).join("\n");
  }

  // ─── Import / Export ─────────────────────────────────────────────────────

  /** Open the Scripts actions menu (⋮). */
  async openActionsMenu() {
    await this.page.getByTitle("Script list options").click();
  }

  /** Trigger export and wait for the download event. */
  async exportScripts() {
    const [download] = await Promise.all([
      this.page.waitForEvent("download"),
      this._clickActionsMenuItem("Export"),
    ]);
    return download;
  }

  /** Trigger the import dialog. */
  async openImportDialog() {
    await this._clickActionsMenuItem("Import");
  }

  private async _clickActionsMenuItem(label: "Import" | "Export") {
    await this.page.getByTitle("Script list options").click();
    await this.page.getByRole("button", { name: label, exact: true }).click();
  }
}
