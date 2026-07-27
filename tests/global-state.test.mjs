import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_GLOBAL_STATE,
  mergeGlobalState,
} from "../packages/shared/src/storage/global-state.storage.ts";

describe("mergeGlobalState", () => {
  it("returns defaults when nothing is stored", () => {
    assert.deepEqual(mergeGlobalState(undefined), DEFAULT_GLOBAL_STATE);
    assert.deepEqual(mergeGlobalState(null), DEFAULT_GLOBAL_STATE);
  });

  it("overlays top-level fields without dropping defaults for omitted keys", () => {
    const merged = mergeGlobalState({
      activeSidebarTab: "modules",
      selectedScriptId: "script-9",
    });

    assert.equal(merged.activeSidebarTab, "modules");
    assert.equal(merged.selectedScriptId, "script-9");
    assert.equal(merged.outputDrawerCollapsed, false);
    assert.equal(merged.outputDrawerActiveTab, "javascript");
    assert.deepEqual(merged.panelSizes, DEFAULT_GLOBAL_STATE.panelSizes);
  });

  it("deep-merges panelSizes so partial writes cannot wipe other panels", () => {
    const merged = mergeGlobalState({
      panelSizes: {
        scriptListSidebarWidth: 42,
      },
    });

    assert.equal(merged.panelSizes.scriptListSidebarWidth, 42);
    assert.equal(merged.panelSizes.scriptCodeEditorHorizontalSplit, 50);
    assert.equal(merged.panelSizes.scriptTypeDefinitionsVerticalSplit, 68);
    assert.equal(merged.panelSizes.scriptCompiledOutputDrawerSplit, 70);
  });
});
