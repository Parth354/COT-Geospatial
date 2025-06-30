import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000, 
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});


// --- Axios Interceptors for Global Logging and Error Normalization ---
api.interceptors.request.use(
  (config) => {
    console.log(`🚀 API Request: ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => {
    console.log(`✅ API Response: ${response.config.method?.toUpperCase()} ${response.config.url} - ${response.status}`);
    return response;
  },
  (error) => {
    console.error('❌ API Response Error:', {
      url: error.config?.url,
      method: error.config?.method,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data
    });
    
    let errorMessage = 'An unexpected error occurred.';
    if (error.response) {
      const { detail } = error.response.data || {};
      errorMessage = Array.isArray(detail)
        ? detail.map(d => `${d.loc?.join('.') || 'field'} - ${d.msg}`).join('; ')
        : detail || error.response.data?.message || `Server error: ${error.response.status} ${error.response.statusText}`;
    } else if (error.request) {
      errorMessage = 'Network error: The server could not be reached.';
    } else {
      errorMessage = error.message;
    }
    return Promise.reject(new Error(errorMessage));
  }
);

export const sessionAPI = {
  /**
   * Gets the current session ID from the server, creating one if it doesn't exist.
   */
  getSession: async () => api.get('/api/session').then(res => res.data.session_id),
};

export const getStatusMessage = (status) => {
  switch (status) {
    case 'uploaded':
      return 'Ready to process';
    case 'ingesting':
      return 'Processing data...';
    case 'processed':
      return 'Ready for map';
    case 'ingestion_failed':
      return 'Processing failed';
    default:
      return status || 'Unknown';
  }
};

/**
 * Utility function to determine if a dataset needs processing
 * @param {object} dataset - The dataset object
 * @returns {boolean} - Whether the dataset needs processing
 */
export const needsProcessing = (dataset) => {
  if (!dataset) return false;
  
  // Raster files don't need processing
  if (dataset.file_type && (dataset.file_type.toLowerCase().includes('tiff') || dataset.file_type.toLowerCase().includes('cog'))) {
    return false;
  }
  
  // Vector files need processing if they're uploaded or failed
  return dataset.status === 'uploaded' || dataset.status === 'ingestion_failed';
};