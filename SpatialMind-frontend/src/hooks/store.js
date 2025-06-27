import { initialState } from './appReducer'
import { v4 as uuidv4 } from 'uuid'

let dispatchRef = null

export const store = {
  state: initialState,
  actions: {
    // Basic state management
    setLoading: (value) => dispatchRef?.({ type: 'SET_LOADING', payload: value }),
    setError: (error) => dispatchRef?.({ type: 'SET_ERROR', payload: error }),
    clearError: () => dispatchRef?.({ type: 'CLEAR_ERROR' }),
    
    // Session management
    setSessionId: (sessionId) => dispatchRef?.({ type: 'SET_SESSION_ID', payload: sessionId }),
    
    // Job management
    setCurrentJob: (jobId, status) => dispatchRef?.({ 
      type: 'SET_CURRENT_JOB', 
      payload: { jobId, status } 
    }),
    updateJobStatus: (status) => dispatchRef?.({ type: 'UPDATE_JOB_STATUS', payload: status }),
    clearCurrentJob: () => dispatchRef?.({ type: 'CLEAR_CURRENT_JOB' }),
    
    // Messages
    addMessage: (content, type = 'user', jobId = null) => dispatchRef?.({ 
      type: 'ADD_MESSAGE', 
      payload: { content, type, jobId, id: uuidv4() } 
    }),
    clearMessages: () => dispatchRef?.({ type: 'CLEAR_MESSAGES' }),
    
    // Chain of Thought
    addCotStep: (step) => dispatchRef?.({ type: 'ADD_COT_STEP', payload: step }),
    updateCotStep: (id, updates) => dispatchRef?.({ 
      type: 'UPDATE_COT_STEP', 
      payload: { id, updates } 
    }),
    clearCotSteps: () => dispatchRef?.({ type: 'CLEAR_COT_STEPS' }),
    
    // Map layers
    addMapLayer: (layer) => dispatchRef?.({ type: 'ADD_MAP_LAYER', payload: layer }),
    updateMapLayer: (layerId, updates) => dispatchRef?.({ 
      type: 'UPDATE_MAP_LAYER', 
      payload: { layerId, updates } 
    }),
    removeMapLayer: (layerId) => dispatchRef?.({ type: 'REMOVE_LAYER', payload: layerId }),
    toggleLayerVisibility: (layerId) => dispatchRef?.({ 
      type: 'TOGGLE_LAYER_VISIBILITY', 
      payload: layerId 
    }),
    setLayerLoading: (layerId, loading) => dispatchRef?.({ 
      type: 'SET_LAYER_LOADING', 
      payload: { layerId, loading } 
    }),
    setLayerError: (layerId, error) => dispatchRef?.({ 
      type: 'SET_LAYER_ERROR', 
      payload: { layerId, error } 
    }),
    clearMapLayers: () => dispatchRef?.({ type: 'CLEAR_MAP_LAYERS' }),
    
    // Map view
    setBaseMap: (mapName) => dispatchRef?.({ type: 'SET_BASE_MAP', payload: mapName }),
    setMapView: (center, zoom) => dispatchRef?.({ 
      type: 'SET_MAP_VIEW', 
      payload: { center, zoom } 
    }),
    setMapBounds: (bounds) => dispatchRef?.({ type: 'SET_MAP_BOUNDS', payload: bounds }),
    
    // Dataset management
    addDataset: (dataset) => dispatchRef?.({ type: 'ADD_DATASET', payload: dataset }),
    removeDataset: (datasetId) => dispatchRef?.({ type: 'REMOVE_DATASET', payload: datasetId }),
    updateDataset: (datasetId, updates) => dispatchRef?.({ 
      type: 'UPDATE_DATASET', 
      payload: { datasetId, updates } 
    }),
    
    // Results
    setResults: (results) => dispatchRef?.({ type: 'SET_RESULTS', payload: results }),
    clearResults: () => dispatchRef?.({ type: 'CLEAR_RESULTS' }),
    
    // Notifications
    addNotification: (notification) => dispatchRef?.({ 
      type: 'ADD_NOTIFICATION', 
      payload: { ...notification, id: notification.id || uuidv4() } 
    }),
    removeNotification: (id) => dispatchRef?.({ type: 'REMOVE_NOTIFICATION', payload: id }),
    clearNotifications: () => dispatchRef?.({ type: 'CLEAR_NOTIFICATIONS' }),
    
    // WebSocket
    setWebSocketConnected: (connected) => dispatchRef?.({ 
      type: 'SET_WEBSOCKET_CONNECTED', 
      payload: connected 
    }),
    
    // State reset
    resetState: () => dispatchRef?.({ type: 'RESET_STATE' }),
  }
}

export const initializeStore = (dispatch) => {
  dispatchRef = dispatch
}