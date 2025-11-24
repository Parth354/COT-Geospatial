import { updateActiveJobMessage } from '../utils/updateActiveJobMessage.js';

export function jobReducer(state, action) {
  switch (action.type) {
    case 'ADD_USER_MESSAGE':
      return { ...state, messages: [...state.messages, { id: `user_${Date.now()}`, type: 'user', content: action.payload.content }] };
      
    case 'START_JOB':
      return {
        ...state,
        isAgentLoading: true,
        activeJobId: action.payload.jobId,
        agentStatusMessage: 'Agent is preparing...',
        messages: [...state.messages, { id: `asst_${action.payload.jobId}`, type: 'assistant', jobId: action.payload.jobId, cot: {} }],
      };
      
    case 'STATUS_UPDATE':
      return { ...updateActiveJobMessage(state, { status_update: action.payload }), agentStatusMessage: action.payload.message };

    case 'CHAIN_OF_THOUGHT':
    case 'ACTION':
    case 'OBSERVATION':
      return updateActiveJobMessage(state, { [action.type.toLowerCase()]: action.payload });
      
    case 'FINAL_STATUS':
      return {
        ...updateActiveJobMessage(state, { final_status: action.payload }),
        isAgentLoading: false,
        activeJobId: null,
      };

    case 'JOB_COMPLETE': {
      const { results, message, analysis_summary } = action.payload;
      const layers = results?.layers || [];
      
      // Update the message with final status
      const updatedState = {
        ...updateActiveJobMessage(state, { 
          final_status: { 
            status: 'completed', 
            message: message || 'Job completed successfully.',
            analysis_summary 
          } 
        }),
        isAgentLoading: false,
        activeJobId: null,
        results: {
          jobId: state.activeJobId,
          summary: message,
          layers: layers,
          analysis_summary: analysis_summary
        },
        // Flag to auto-add layers to map
        _pendingLayersToAdd: layers.map(layer => ({
          layerId: `${state.activeJobId}-${layer.layer_name}`,
          name: layer.layer_name,
          type: 'analysis_result',
          visible: true,
          dataUrl: layer.url,
          featureCount: layer.feature_count,
          bbox: layer.bbox,
          style: layer.style || { color: '#ff5722', fillOpacity: 0.6, weight: 2 },
          datasetId: state.activeJobId,
        }))
      };
      return updatedState;
    }

    case 'INGESTION_COMPLETE':
    case 'INGESTION_FAILED': {
        // Handle both direct payload and nested payload structures
        // The payload structure is: { ingestion_complete: {...} } or { ingestion_failed: {...} }
        const ingestionPayload = action.payload?.ingestion_complete || action.payload?.ingestion_failed || action.payload;
        
        if (!ingestionPayload) {
            console.warn(`[jobReducer] ${action.type} received but no payload found:`, action.payload);
            return state;
        }
        
        const datasetId = ingestionPayload?.dataset_id || ingestionPayload?.layer?.layer_id;
        const jobId = ingestionPayload?.job_id || datasetId;
        
        console.log(`📦 Ingestion ${action.type}:`, { datasetId, jobId, payload: ingestionPayload });
        
        if (!datasetId) {
            console.warn(`[jobReducer] ${action.type} received but no dataset_id found in payload:`, ingestionPayload);
            return state;
        }
        
        const newNotification = { 
            id: `ingest_${jobId || Date.now()}`, 
            type: 'assistant', 
            jobId: jobId, 
            cot: { [action.type.toLowerCase()]: ingestionPayload }
        };
        
        // Return state with notification and flag to update dataset status
        return { 
            ...state, 
            messages: [...state.messages, newNotification],
            _pendingDatasetUpdate: action.type === 'INGESTION_COMPLETE' 
                ? { datasetId, status: 'processed' } 
                : { datasetId, status: 'ingestion_failed' }
        };
    }

    default:
      return state;
  }
}