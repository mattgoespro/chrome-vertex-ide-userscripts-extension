import { createAsyncThunk } from "@reduxjs/toolkit/react";
import { GlobalStateManager } from "@shared/storage";

export const hydrateUi = createAsyncThunk("ui/hydrateUi", async () => {
  return GlobalStateManager.get();
});
