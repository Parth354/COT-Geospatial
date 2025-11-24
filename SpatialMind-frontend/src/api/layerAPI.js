import { api} from './api.js'; 
import webSocketService from '../socket/websocket.js';

export const layerAPI = {
  ingestDataset: async (datasetId, actions) => {
    try {
      if (!datasetId) throw new Error('Dataset ID is required to start ingestion.');

      console.log(`🚀 Triggering ingestion for dataset: ${datasetId}`);
      const response = await api.post(`/api/layers/ingest/${datasetId}`);

      const { task_id, status, message } = response.data;

      if (!task_id) {
        console.warn('⚠️ No task_id returned from ingestion endpoint. Status:', status);
        // If already processed, update the dataset status in the frontend
        if (status === 'processed' && actions) {
          actions.updateDatasetStatus(datasetId, 'processed');
        }
        return { taskId: null, message, status };
      }

      console.log(`🗂️ Ingestion triggered. Task ID: ${task_id}, Status: ${status}`);

      // Subscribe to WebSocket job updates using task_id
      webSocketService.subscribe(task_id);
      
      // Also subscribe to dataset_id for backward compatibility
      webSocketService.subscribe(datasetId);

      // The central dispatcher in App.jsx will handle INGESTION_COMPLETE messages
      // No need to register a temporary dispatcher - it will break the main one

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

      const queryString = params.toString();
      const url = `/api/layers/${layerId}/data${queryString ? `?${queryString}` : ''}`;
      
      console.log(`🗺️ Fetching layer data for ${layerId} with params:`, Object.fromEntries(params));

      const response = await api.get(url);

      console.log(`✅ Layer data fetched for ${layerId}:`, {
        featureCount: response.data?.features?.length || 0,
        type: response.data?.type,
      });

      // Return empty FeatureCollection if no features (instead of throwing error)
      return response.data || { type: 'FeatureCollection', features: [] };
    } catch (err) {
      console.error(`❌ Failed to fetch layer data for ${layerId}:`, err);

      // Return empty collection instead of throwing for 404 (layer might not have features in current view)
      if (err.response?.status === 404) {
        console.warn(`Layer ${layerId} returned 404, returning empty collection`);
        return { type: 'FeatureCollection', features: [] };
      } else if (err.response?.status === 500) {
        throw new Error(`Server error while fetching layer data. Try again later.`);
      }

      // For other errors, return empty collection to prevent map crashes
      return { type: 'FeatureCollection', features: [] };
    }
  }
};

