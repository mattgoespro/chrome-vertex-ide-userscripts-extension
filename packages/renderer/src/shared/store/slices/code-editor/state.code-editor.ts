export interface MonacoEditorState {
  monacoReady: boolean;
  ideReady: boolean;
}

export const initialState: MonacoEditorState = {
  monacoReady: false,
  ideReady: false,
};
