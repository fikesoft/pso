import { workspaceInitialState } from '../config/workspace.constants';
import type { WorkspaceContext, DraftProduct } from './workspace.types';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
const slice = createSlice({
  name: 'workspace',
  initialState: workspaceInitialState,
  reducers: {
    setContext(state, action: PayloadAction<WorkspaceContext>) {
      if (
        state.organizationId !== action.payload.organizationId ||
        state.locationId !== action.payload.locationId
      )
        state.draft = [];
      Object.assign(state, action.payload);
    },
    setView(state, action: PayloadAction<string>) {
      state.view = action.payload;
    },
    addDraft(state, action: PayloadAction<DraftProduct>) {
      const item = state.draft.find((row) => row.id === action.payload.id);
      if (item) item.quantity++;
      else state.draft.push({ ...action.payload, quantity: 1 });
    },
    clearDraft(state) {
      state.draft = [];
    },
    clearWorkspace() {
      return workspaceInitialState;
    },
  },
});
export const { setContext, setView, addDraft, clearDraft, clearWorkspace } = slice.actions;
export const makeStore = () => configureStore({ reducer: { workspace: slice.reducer } });
