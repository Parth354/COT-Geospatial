import { jobReducer } from './jobReducer.js';
import { uiReducer } from './uiReducer.js';
import { systemReducer } from './systemReducer.js';
import { initialState } from './initialState.js';

/**
 * The main reducer function for the application. It calls each slice
 * reducer in sequence to build the next state.
 * @param {object} state - The current state.
 * @param {object} action - The dispatched action.
 * @returns {object} The new state.
 */
export function appReducer(state, action) {
  // Log every action for easy debugging in the browser console
  console.log(`%c Action Dispatched: %c${action.type}`, 'color: #999;', 'color: #00A; font-weight: bold;', action.payload);

  // The CLEAR_CHAT action is a special case that resets multiple state slices.
  if (action.type === 'CLEAR_CHAT') {
    return {
      ...state,
      sessionId: state.sessionId,
      websocketConnected: state.websocketConnected,
      uploadedDatasets: state.uploadedDatasets,
      error: initialState.error,
      notifications: initialState.notifications,
      messages: initialState.messages,
      activeJobId: initialState.activeJobId,
      isAgentLoading: initialState.isAgentLoading,
      agentStatusMessage: initialState.agentStatusMessage,
      results: initialState.results,
      mapLayers: initialState.mapLayers,
    };
  }

  const reducers = [jobReducer, uiReducer, systemReducer];
  const nextState = reducers.reduce(
    (currentState, reducer) => reducer(currentState, action),
    state
  );
  
  // Handle pending dataset status updates from ingestion
  if (nextState._pendingDatasetUpdate) {
    const { datasetId, status } = nextState._pendingDatasetUpdate;
    const updatedState = uiReducer(nextState, {
      type: 'UPDATE_DATASET_STATUS',
      payload: { datasetId, status }
    });
    delete updatedState._pendingDatasetUpdate;
    return updatedState;
  }
  
  // Handle pending layers to add from job_complete
  if (nextState._pendingLayersToAdd && nextState._pendingLayersToAdd.length > 0) {
    const layers = nextState._pendingLayersToAdd;
    let updatedState = { ...nextState };
    delete updatedState._pendingLayersToAdd;
    
    // Add each layer to the map
    layers.forEach(layer => {
      updatedState = uiReducer(updatedState, {
        type: 'ADD_MAP_LAYER',
        payload: { layer }
      });
    });
    
    return updatedState;
  }
  
  return nextState;
}