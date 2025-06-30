import { api} from './api.js'; 
import webSocketService from '../socket/websocket.js';

export const layerAPI = {
  ingestDataset: async (datasetId, onStatusUpdate) => {
    try {
      if (!datasetId) throw new Error('Dataset ID is required to start ingestion.');

      console.log(`🚀 Triggering ingestion for dataset: ${datasetId}`);
      const response = await api.post(`/api/layers/ingest/${datasetId}`);

      const { task_id, status, message } = response.data;

      console.log(`🗂️ Ingestion triggered. Task ID: ${task_id}, Status: ${status}`);

      // Subscribe to WebSocket job updates
      webSocketService.subscribe(task_id);

      const handleWSUpdate = (action) => {
        if (action.type === 'TASK_UPDATE' && action.payload.job_id === task_id) {
          console.log(`📡 WebSocket Update:`, action.payload);

          if (typeof onStatusUpdate === 'function') {
            onStatusUpdate(action.payload);
          }

          if (action.payload.status === 'ingested' || action.payload.status === 'failed') {
            webSocketService.unsubscribe(task_id);
            webSocketService.unregisterDispatcher();
          }
        }
      };

      // Register temporary dispatcher for this task
      webSocketService.registerDispatcher(handleWSUpdate);

      return { taskId: task_id, message, status };
    } catch (err) {
      console.error('❌ Failed to trigger ingestion:', err);
      throw err;
    }
  },

  /**
   * Fetches layer data after ingestion is complete.
   */
  fetchLayerData: async (layerId, options = {}) => {
    try {
      if (!layerId) throw new Error('Layer ID is required to fetch layer data.');

      const params = new URLSearchParams();
      if (options.bbox) {
        const { west, south, east, north } = options.bbox;
        params.append('bbox', `${west},${south},${east},${north}`);
      }
      if (options.zoom != null) {
        params.append('zoom', options.zoom);
      }

      console.log(`🗺️ Fetching layer data for ${layerId} with params:`, Object.fromEntries(params));

      const response = await api.get(`/api/layers/${layerId}/data`);

      console.log(`✅ Layer data fetched for ${layerId}:`, {
        featureCount: response.data?.features?.length || 0,
        type: response.data?.type,
      });

      return response.data;
    } catch (err) {
      console.error(`❌ Failed to fetch layer data for ${layerId}:`, err);

      if (err.response?.status === 404) {
        throw new Error(`Layer '${layerId}' not found or not yet processed. Please wait or try reloading.`);
      } else if (err.response?.status === 500) {
        throw new Error(`Server error while fetching layer data. Try again later.`);
      }

      throw err;
    }
  }
};

