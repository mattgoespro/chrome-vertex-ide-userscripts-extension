import { GlobalModules } from "@shared/model";

export type ModulesState = {
  modules: GlobalModules;
};

export const initialState: ModulesState = {
  modules: {},
};
