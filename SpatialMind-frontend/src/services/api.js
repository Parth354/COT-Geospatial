import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api'

// Create axios instance with default config
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
})

// Request interceptor
api.interceptors.request.use(
  (config) => {
    console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`)
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor with proper error handling per spec
api.interceptors.response.use(
  (response) => {
    return response
  },
  (error) => {
    console.error('API Error:', error)
    
    // Handle structured error responses per API spec
    if (error.response?.data) {
      const errorData = error.response.data
      if (errorData.error_code && errorData.message) {
        // Structured error from backend
        throw new Error(`${errorData.error_code}: ${errorData.message}`)
      }
    }
    
    return Promise.reject(error)
  }
)

// Query API - Fully compliant with API spec
export const queryAPI = {
  submitQuery: async (query, sessionId, context = {}) => {
    const response = await api.post('/api/query', {
      query,
      session_id: sessionId,
      context: {
        uploaded_datasets: context.uploadedDatasets || [],
        current_map_bounds: context.currentMapBounds || null,
        ...context
      }
    })
    
    // API spec returns: { job_id, status, estimated_time, websocket_channel }
    return {
      jobId: response.data.job_id,
      status: response.data.status,
      estimatedTime: response.data.estimated_time,
      websocketChannel: response.data.websocket_channel
    }
  }
}

// Upload API - Fully compliant with API spec
export const uploadAPI = {
  uploadFile: async (file, metadata = {}, onProgress) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('metadata', JSON.stringify({
      name: metadata.name || file.name,
      description: metadata.description || '',
      tags: metadata.tags || []
    }))
    
    const response = await api.post('/api/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          )
          onProgress(percentCompleted)
        }
      }
    })
    
    // API spec returns snake_case, but we keep it as-is for frontend
    return response.data
  }
}

// Results API - Fully compliant with API spec
export const resultsAPI = {
  getResults: async (jobId) => {
    const response = await api.get(`/api/results/${jobId}`)
    
    // Transform API response to match frontend expectations
    const data = response.data
    return {
      jobId: data.job_id,
      status: data.status,
      results: {
        mapLayers: data.results.map_layers?.map(layer => ({
          layerId: layer.layer_id,
          name: layer.name,
          type: layer.type,
          style: layer.style,
          dataUrl: layer.data_url,
          legend: layer.legend,
          bbox: layer.bbox
        })) || [],
        metrics: data.results.metrics || {},
        summary: data.results.summary,
        downloadableFiles: data.results.downloadable_files?.map(file => ({
          name: file.name,
          url: file.url,
          sizeMb: file.size_mb
        })) || []
      },
      processingTime: data.processing_time,
      createdAt: data.created_at
    }
  },
  
  downloadResult: async (jobId, filename) => {
    const response = await api.get(`/api/download/${jobId}/${filename}`, {
      responseType: 'blob'
    })
    return response.data
  }
}

// Layer Data API - Fully compliant with API spec
export const layerAPI = {
  getLayerData: async (layerId, options = {}) => {
    const params = {}
    if (options.bbox) {
      // Convert bbox object to string format expected by API
      const bbox = options.bbox
      params.bbox = `${bbox.west},${bbox.south},${bbox.east},${bbox.north}`
    }
    if (options.zoom) params.zoom = options.zoom
    if (options.format) params.format = options.format
    
    const response = await api.get(`/api/layers/${layerId}/data`, { params })
    return response.data
  }
}

// Datasets API - Fully compliant with API spec
export const datasetsAPI = {
  getUserDatasets: async () => {
    const response = await api.get('/api/datasets')
    
    // Transform API response (snake_case to camelCase for frontend)
    return {
      datasets: response.data.datasets.map(dataset => ({
        datasetId: dataset.dataset_id,
        name: dataset.name,
        fileType: dataset.file_type,
        sizeMb: dataset.size_mb,
        featureCount: dataset.feature_count,
        uploadTime: dataset.upload_time,
        tags: dataset.tags,
        bbox: dataset.bbox,
        crs: dataset.crs,
        status: dataset.status
      }))
    }
  },
  
  deleteDataset: async (datasetId) => {
    await api.delete(`/api/datasets/${datasetId}`)
    return true
  }
}

// WebSocket connection helper - Compliant with API spec
// WebSocket connection helper - Fixed version
export const createWebSocketConnection = (jobId, callbacks = {}) => {
  // Fix WebSocket URL construction
  const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'
  const wsUrl = baseUrl.replace(/^http/, 'ws') + '/ws'
  
  console.log('🔌 Creating WebSocket connection to:', wsUrl, 'for job:', jobId)
  
  const ws = new WebSocket(wsUrl)
  
  ws.onopen = () => {
    console.log('✅ WebSocket connected to:', wsUrl)
    
    // Join the job channel as per API spec
    const joinMessage = {
      type: 'join_channel',
      job_id: jobId
    }
    
    console.log('📤 Sending join_channel message:', joinMessage)
    ws.send(JSON.stringify(joinMessage))
    
    callbacks.onOpen?.()
  }
  
  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data)
      console.log('📥 Received WebSocket message:', message)
      
      switch (message.type) {
        case 'cot_step':
          callbacks.onCotStep?.({
            jobId: message.job_id,
            stepNumber: message.step_number,
            stepType: message.step_type,
            content: message.content,
            timestamp: message.timestamp
          })
          break
          
        case 'tool_execution':
          callbacks.onToolExecution?.({
            jobId: message.job_id,
            tool: message.tool,
            status: message.status,
            progress: message.progress,
            message: message.message
          })
          break
          
        case 'job_complete':
          callbacks.onJobComplete?.({
            jobId: message.job_id,
            status: message.status,
            resultsUrl: message.results_url
          })
          break
          
        case 'error':
          callbacks.onError?.({
            jobId: message.job_id,
            errorCode: message.error_code,
            message: message.message,
            details: message.details
          })
          break
          
        default:
          console.log('❓ Unknown WebSocket message type:', message.type)
      }
    } catch (error) {
      console.error('❌ Error parsing WebSocket message:', error)
    }
  }
  
  ws.onerror = (error) => {
    console.error('❌ WebSocket error:', error)
    callbacks.onError?.(error)
  }
  
  ws.onclose = (event) => {
    console.log('🔌 WebSocket disconnected:', event.code, event.reason)
    callbacks.onClose?.(event)
  }
  
  return {
    close: () => {
      console.log('🛑 Closing WebSocket connection')
      ws.close()
    },
    send: (message) => {
      console.log('📤 Sending message:', message)
      ws.send(JSON.stringify(message))
    },
    readyState: ws.readyState
  }
}

export default api