import type { CompilationError } from "@shared/errors";

type CompilationErrorLanguage = CompilationError["language"];

export interface WorkspaceState {
  scriptErrors: Record<
    string,
    Partial<Record<CompilationErrorLanguage, CompilationError[]>>
  >;
}

export const initialState: WorkspaceState = {
  scriptErrors: {},
};
