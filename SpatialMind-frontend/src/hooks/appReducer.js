export const initialState = {
  // Chat & CoT state
  messages: [],
  cotSteps: [],
  currentJobId: null,
  processingStatus: null,
  
  // Map & Layers state
  mapLayers: [],
  baseMap: 'osm',
  mapCenter: [20.5937, 78.9629], 
  mapZoom: 5,
  mapBounds: null,
  
  // Data management
  uploadedDatasets: [], // Changed from uploadedFiles to match API
  results: null,
  
  // System state
  notifications: [],
  loading: false,
  error: null,
  websocketConnected: false,
  
  // Session management
  sessionId: null
}

export function appReducer(state, action) {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: action.payload }

    case 'SET_ERROR':
      return {
        ...state,
        error: action.payload,
        loading: false,
        notifications: [
          ...state.notifications,
          {
            id: Date.now(),
            type: 'error',
            message: action.payload,
            timestamp: new Date().toISOString()
          }
        ]
      }

    case 'CLEAR_ERROR':
      return { ...state, error: null }

    // Session management
    case 'SET_SESSION_ID':
      return { ...state, sessionId: action.payload }

    // Job management
    case 'SET_CURRENT_JOB':
      return { 
        ...state, 
        currentJobId: action.payload.jobId,
        processingStatus: action.payload.status,
        cotSteps: [] // Clear previous CoT steps for new job
      }

    case 'UPDATE_JOB_STATUS':
      return { 
        ...state, 
        processingStatus: action.payload 
      }

    case 'CLEAR_CURRENT_JOB':
      return { 
        ...state, 
        currentJobId: null,
        processingStatus: null,
        cotSteps: []
      }

    // Messages
    case 'ADD_MESSAGE':
      return {
        ...state,
        messages: [...state.messages, {
          id: action.payload.id || Date.now(),
          content: action.payload.content,
          type: action.payload.type || 'user',
          timestamp: action.payload.timestamp || new Date().toISOString(),
          jobId: action.payload.jobId
        }]
      }

    case 'CLEAR_MESSAGES':
      return { ...state, messages: [] }

    // Chain of Thought steps
    case 'ADD_COT_STEP':
      return {
        ...state,
        cotSteps: [...state.cotSteps, {
          id: action.payload.id || Date.now(),
          jobId: action.payload.jobId,
          stepNumber: action.payload.stepNumber,
          stepType: action.payload.stepType,
          content: action.payload.content,
          timestamp: action.payload.timestamp || new Date().toISOString(),
          progress: action.payload.progress
        }]
      }

    case 'UPDATE_COT_STEP':
      return {
        ...state,
        cotSteps: state.cotSteps.map(step =>
          step.id === action.payload.id ? { ...step, ...action.payload.updates } : step
        )
      }

    case 'CLEAR_COT_STEPS':
      return { ...state, cotSteps: [] }

    // Map layers - Updated to match API layer structure
    case 'ADD_MAP_LAYER':
      return {
        ...state,
        mapLayers: [...state.mapLayers, {
          layerId: action.payload.layerId,
          name: action.payload.name,
          type: action.payload.type,
          visible: action.payload.visible !== undefined ? action.payload.visible : true,
          style: action.payload.style || {},
          dataUrl: action.payload.dataUrl,
          legend: action.payload.legend,
          bbox: action.payload.bbox,
          loading: false,
          error: null
        }]
      }

    case 'UPDATE_MAP_LAYER':
      return {
        ...state,
        mapLayers: state.mapLayers.map(layer =>
          layer.layerId === action.payload.layerId ? { ...layer, ...action.payload.updates } : layer
        )
      }

    case 'REMOVE_LAYER':
      return {
        ...state,
        mapLayers: state.mapLayers.filter(layer => layer.layerId !== action.payload)
      }

    case 'TOGGLE_LAYER_VISIBILITY':
      return {
        ...state,
        mapLayers: state.mapLayers.map(layer =>
          layer.layerId === action.payload ? { ...layer, visible: !layer.visible } : layer
        )
      }

    case 'SET_LAYER_LOADING':
      return {
        ...state,
        mapLayers: state.mapLayers.map(layer =>
          layer.layerId === action.payload.layerId 
            ? { ...layer, loading: action.payload.loading } 
            : layer
        )
      }

    case 'SET_LAYER_ERROR':
      return {
        ...state,
        mapLayers: state.mapLayers.map(layer =>
          layer.layerId === action.payload.layerId 
            ? { ...layer, error: action.payload.error, loading: false } 
            : layer
        )
      }

    case 'CLEAR_MAP_LAYERS':
      return { ...state, mapLayers: [] }

    // Map view
    case 'SET_BASE_MAP':
      return { ...state, baseMap: action.payload }

    case 'SET_MAP_VIEW':
      return {
        ...state,
        mapCenter: action.payload.center,
        mapZoom: action.payload.zoom
      }

    case 'SET_MAP_BOUNDS':
      return {
        ...state,
        mapBounds: action.payload
      }

    // Dataset management - Updated to match API structure
    case 'ADD_DATASET':
      return {
        ...state,
        uploadedDatasets: [...state.uploadedDatasets, {
          datasetId: action.payload.datasetId,
          name: action.payload.name,
          fileType: action.payload.fileType,
          sizeMb: action.payload.sizeMb,
          featureCount: action.payload.featureCount,
          bbox: action.payload.bbox,
          crs: action.payload.crs,
          uploadTime: action.payload.uploadTime,
          status: action.payload.status,
          tags: action.payload.tags || []
        }],
        notifications: [
          ...state.notifications,
          {
            id: Date.now(),
            type: 'success',
            title: 'Dataset Uploaded',
            message: `${action.payload.name} has been uploaded successfully`,
            timestamp: new Date().toISOString()
          }
        ]
      }

    case 'REMOVE_DATASET':
      return {
        ...state,
        uploadedDatasets: state.uploadedDatasets.filter(dataset => dataset.datasetId !== action.payload)
      }

    case 'UPDATE_DATASET':
      return {
        ...state,
        uploadedDatasets: state.uploadedDatasets.map(dataset =>
          dataset.datasetId === action.payload.datasetId 
            ? { ...dataset, ...action.payload.updates } 
            : dataset
        )
      }

    // Results - Updated to match API structure
    case 'SET_RESULTS':
      return {
        ...state,
        results: {
          jobId: action.payload.jobId,
          status: action.payload.status,
          mapLayers: action.payload.mapLayers || [],
          metrics: action.payload.metrics || {},
          summary: action.payload.summary,
          downloadableFiles: action.payload.downloadableFiles || [],
          processingTime: action.payload.processingTime,
          createdAt: action.payload.createdAt
        },
        notifications: [
          ...state.notifications,
          {
            id: Date.now(),
            type: 'success',
            title: 'Analysis Complete',
            message: 'Your geospatial analysis has been completed',
            timestamp: new Date().toISOString()
          }
        ]
      }

    case 'CLEAR_RESULTS':
      return { ...state, results: null }

    // Notifications
    case 'ADD_NOTIFICATION':
      return {
        ...state,
        notifications: [...state.notifications, {
          id: action.payload.id || Date.now(),
          type: action.payload.type || 'info',
          title: action.payload.title,
          message: action.payload.message,
          timestamp: new Date().toISOString(),
          timeout: action.payload.timeout,
          autoRemove: action.payload.autoRemove,
          action: action.payload.action
        }]
      }

    case 'REMOVE_NOTIFICATION':
      return {
        ...state,
        notifications: state.notifications.filter(notification => notification.id !== action.payload)
      }

    case 'CLEAR_NOTIFICATIONS':
      return { ...state, notifications: [] }

    // WebSocket connection
    case 'SET_WEBSOCKET_CONNECTED':
      return { ...state, websocketConnected: action.payload }

    case 'RESET_STATE':
      return { ...initialState, sessionId: state.sessionId } // Preserve session

    default:
      return state
  }
}