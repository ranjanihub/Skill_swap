import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Connection } from '../types/connections';

interface ConnectionsState {
  activeConnections: Connection[];
  pendingConnections: Connection[];
}

const initialState: ConnectionsState = {
  activeConnections: [],
  pendingConnections: [],
};

const connectionsSlice = createSlice({
  name: 'connections',
  initialState,
  reducers: {
    addConnection: (state, action: PayloadAction<Connection>) => {
      state.activeConnections.push(action.payload);
    },
    updateConnection: (state, action: PayloadAction<Connection>) => {
      const index = state.activeConnections.findIndex(conn => conn.id === action.payload.id);
      if (index !== -1) {
        state.activeConnections[index] = action.payload;
      }
    },
    removeConnection: (state, action: PayloadAction<string>) => {
      state.activeConnections = state.activeConnections.filter(conn => conn.id !== action.payload);
    },
    addPendingConnection: (state, action: PayloadAction<Connection>) => {
      state.pendingConnections.push(action.payload);
    },
    removePendingConnection: (state, action: PayloadAction<string>) => {
      state.pendingConnections = state.pendingConnections.filter(conn => conn.id !== action.payload);
    },
  },
});

export const {
  addConnection,
  updateConnection,
  removeConnection,
  addPendingConnection,
  removePendingConnection,
} = connectionsSlice.actions;

export default connectionsSlice.reducer;