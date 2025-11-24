export const initialState = {
  sessionId: null,
  websocketConnected: false,
  error: null,
  notifications: [],

  messages: [],
  activeJobId: null,
  isAgentLoading: false,
  agentStatusMessage: 'Processing...',


  uploadedDatasets: [],
  results: null,

  mapLayers: [],
  mapCenter: [20.5937, 78.9629],
  mapZoom: 5,
  mapFitBounds: null,
  mapFullscreen: false,
};