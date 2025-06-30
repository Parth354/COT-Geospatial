import { useMemo } from 'react';

/**
 * A custom hook that provides a memoized object of action creators.
 * These functions dispatch actions to the app's central reducer.
 * Using this hook prevents components from needing to call `dispatch` directly
 * and ensures that the action functions have stable references, which helps
 * optimize performance by preventing unnecessary re-renders.
 * 
 * @param {Function} dispatch - The dispatch function from the `useReducer` hook.
 * @returns {object} A memoized object containing all action creator functions.
 */
export const useAppActions = (dispatch) => {
  const actions = useMemo(() => ({
    /**
     * A generic dispatcher for actions received from external sources like WebSockets,
     * which already have the correct { type, payload } structure.
     * @example
     * actions.dispatch({ type: 'CHAIN_OF_THOUGHT', payload: dataFromSocket })
     */
    dispatch: (action) => dispatch(action),

    // ===================================
    // System & Connection Actions
    // ===================================
    /** Sets the session ID for the current user. */
    setSessionId: (sessionId) => dispatch({ type: 'SET_SESSION_ID', payload: sessionId }),
    /** Sets a global error message for the application. Also stops the main loading indicator. */
    setError: (message, details = {}) => dispatch({ type: 'SET_ERROR', payload: { message, details } }),
    /** Clears the global error message. */
    clearError: () => dispatch({ type: 'CLEAR_ERROR' }),

    // ===================================
    // Job & Chat Actions
    // ===================================
    /** Adds a user's message to the chat display. */
    addUserMessage: (content) => dispatch({ type: 'ADD_USER_MESSAGE', payload: { content } }),
    /** Initiates a new agent job, creating an assistant message bubble and showing a loading state. */
    startJob: (jobId) => dispatch({ type: 'START_JOB', payload: { jobId } }),
    /** Resets the chat, map, and results, but preserves the user's session and uploaded datasets. */
    clearChat: () => dispatch({ type: 'CLEAR_CHAT' }),

    // ===================================
    // Dataset Actions
    // ===================================
    /** Adds a newly uploaded dataset to the list of available datasets. */
    addDataset: (dataset) => dispatch({ type: 'ADD_DATASET', payload: { dataset } }),
    /** Permanently removes a dataset from the application. */
    removeDataset: (datasetId) => dispatch({ type: 'REMOVE_DATASET', payload: { datasetId } }),
    /** Updates the status of a dataset (e.g., 'uploading', 'ingesting', 'processed'). */
    updateDatasetStatus: (datasetId, status) => dispatch({ type: 'UPDATE_DATASET_STATUS', payload: { datasetId, status } }),
    
    // ===================================
    // Map Layer Actions
    // ===================================
    /** Adds a new vector or raster layer to the map. */
    addMapLayer: (layer) => dispatch({ type: 'ADD_MAP_LAYER', payload: { layer } }),
    /** Removes a layer from the map. */
    removeMapLayer: (layerId) => dispatch({ type: 'REMOVE_MAP_LAYER', payload: { layerId } }),
    /** Toggles the visibility of a map layer on and off. */
    toggleLayerVisibility: (layerId) => dispatch({ type: 'TOGGLE_LAYER_VISIBILITY', payload: { layerId } }),
    /** Reorders map layers for display, affecting their Z-index. */
    reorderMapLayers: (sourceId, targetId) => dispatch({ type: 'REORDER_MAP_LAYERS', payload: { sourceId, targetId } }),

    // ===================================
    // Map View & Results Actions
    // ===================================
    /**
     * Sets the map's view. Can be used to reset to home, or fit to a dataset's bounds.
     * @param {number[] | null} center - The new center coordinates as [latitude, longitude].
     * @param {number | null} zoom - The new zoom level.
     * @param {object | null} bounds - A bounding box object to fit the map to.
     */
    setMapView: (center, zoom, bounds) => dispatch({ type: 'SET_MAP_VIEW', payload: { center, zoom, bounds } }),
    /** Sets the content to be displayed in the results panel. */
    setResults: (results) => dispatch({ type: 'SET_RESULTS', payload: { results } }),
    /** Clears the content from the results panel by setting it to null. */
    clearResults: () => dispatch({ type: 'SET_RESULTS', payload: { results: null } }),

    // ===================================
    // Notification Actions
    // ===================================
    /** 
     * Shows a short-lived notification toast to the user.
     * @param {{message: string, type: 'success'|'error'|'info'}} notification - The notification content.
     */
    addNotification: (notification) => dispatch({ type: 'ADD_NOTIFICATION', payload: { notification } }),
    /** Removes a notification toast, usually called by the toast component itself after its timeout. */
    removeNotification: (id) => dispatch({ type: 'REMOVE_NOTIFICATION', payload: { id } }),

  }), [dispatch]);

  return actions;
};