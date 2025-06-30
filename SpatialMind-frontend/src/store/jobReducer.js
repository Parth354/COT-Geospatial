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

    case 'INGESTION_COMPLETE':
    case 'INGESTION_FAILED': {
        const payload = action.payload.ingestion_complete || action.payload.ingestion_failed;
        const jobId = payload.job_id || payload.layer?.layer_id;
        const newNotification = { id: `ingest_${jobId}`, type: 'assistant', jobId: jobId, cot: action.payload };
        return { ...state, messages: [...state.messages, newNotification]};
    }

    default:
      return state;
  }
}