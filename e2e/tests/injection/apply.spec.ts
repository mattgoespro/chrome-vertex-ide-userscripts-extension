import { test, expect, buildUserscript } from "../../fixtures";
import { OptionsPage, ScriptsPage } from "../../pages";
import {
  buildCompiledLocalEntry,
  matchingExampleScript,
  openContentTab,
  readInvertMarker,
  sendApplyScripts,
  waitForHtmlOpacity,
  waitForInvertMarker,
} from "../../helpers/injection";

const MARKER_JS = `document.documentElement.setAttribute("data-invert","on");`;
const OPACITY_CSS = `html { opacity: 0.5 !important; }`;

test.describe("Injection — apply / CSS replace", () => {
  test("toggling on injects into an already-open matching tab without navigation", async ({
    extensionContext,
    optionsPage,
    clearStorage,
    seedStorage,
  }) => {
    const script = buildUserscript({
      name: "ToggleApply",
      ...matchingExampleScript(),
    });

    await clearStorage(optionsPage);
    await seedStorage(
      optionsPage,
      { [`userscript:${script.id}`]: script },
      buildCompiledLocalEntry(script.id, {
        javascript: MARKER_JS,
        css: OPACITY_CSS,
      })
    );
    await optionsPage.reload();

    const content = await openContentTab(
      extensionContext,
      "https://example.com/"
    );

    await expect(await readInvertMarker(content)).toBeNull();
    await waitForHtmlOpacity(content, "1");

    const options = new OptionsPage(optionsPage);
    const scripts = new ScriptsPage(optionsPage);
    await options.waitForReady();
    await scripts.toggleScript("ToggleApply");

    await waitForInvertMarker(content, "on");
    await waitForHtmlOpacity(content, "0.5");

    // No navigation: URL must still be the same document.
    expect(content.url()).toMatch(/^https:\/\/example\.com\/?/);

    await content.close();
  });

  test("toggling off removes injected CSS; re-apply does not stack opacity", async ({
    extensionContext,
    optionsPage,
    clearStorage,
    seedStorage,
  }) => {
    const script = buildUserscript({
      name: "CssReplace",
      ...matchingExampleScript({ enabled: true }),
    });

    await clearStorage(optionsPage);
    await seedStorage(
      optionsPage,
      { [`userscript:${script.id}`]: script },
      buildCompiledLocalEntry(script.id, {
        javascript: MARKER_JS,
        css: OPACITY_CSS,
      })
    );
    await optionsPage.reload();

    const content = await openContentTab(
      extensionContext,
      "https://example.com/"
    );

    // Enabled script injects on navigation.
    await waitForInvertMarker(content, "on");
    await waitForHtmlOpacity(content, "0.5");

    // Identical re-apply must not compound opacity (replace / no-op).
    await sendApplyScripts(optionsPage, [script.id]);
    await waitForHtmlOpacity(content, "0.5");
    await sendApplyScripts(optionsPage, [script.id]);
    await waitForHtmlOpacity(content, "0.5");

    const options = new OptionsPage(optionsPage);
    const scripts = new ScriptsPage(optionsPage);
    await options.waitForReady();
    await scripts.toggleScript("CssReplace");

    await waitForHtmlOpacity(content, "1");

    await content.close();
  });

  test("apply only touches matching tabs", async ({
    extensionContext,
    optionsPage,
    clearStorage,
    seedStorage,
  }) => {
    const script = buildUserscript({
      name: "MatchOnly",
      ...matchingExampleScript(),
    });

    await clearStorage(optionsPage);
    await seedStorage(
      optionsPage,
      { [`userscript:${script.id}`]: script },
      buildCompiledLocalEntry(script.id, {
        javascript: MARKER_JS,
        css: OPACITY_CSS,
      })
    );
    await optionsPage.reload();

    const matching = await openContentTab(
      extensionContext,
      "https://example.com/"
    );
    const unrelated = await openContentTab(
      extensionContext,
      "https://example.org/"
    );

    await expect(await readInvertMarker(matching)).toBeNull();
    await expect(await readInvertMarker(unrelated)).toBeNull();

    const options = new OptionsPage(optionsPage);
    const scripts = new ScriptsPage(optionsPage);
    await options.waitForReady();
    await scripts.toggleScript("MatchOnly");

    await waitForInvertMarker(matching, "on");
    await waitForHtmlOpacity(matching, "0.5");

    await expect(await readInvertMarker(unrelated)).toBeNull();
    await waitForHtmlOpacity(unrelated, "1");

    await matching.close();
    await unrelated.close();
  });
});
