import { api } from "./api";
import webSocketService from '../socket/websocket.js';


export const queryAPI = {
  /**
   * Submits a query, then dispatches actions to start the job and subscribes to the WebSocket channel.
   * @param {{ query: string, sessionId: string }} params - The query parameters.
   * @param {object} actions - The actions object from `useAppActions`.
   */
  submitQuery: async ({ query, sessionId, context = {}, modelType = 'gemini' }, actions) => {
    try {
      if (!sessionId) throw new Error('A session ID is required to submit a query.');
      
      const response = await api.post('/api/query/', {
        query,
        session_id: sessionId,
        model_type: modelType,
        context: context,
      });

      const { job_id } = response.data;
      
      // Dispatch the action to put the UI in a "loading" state
      actions.startJob(job_id);
      
      // Subscribe to the WebSocket channel for real-time updates for this job
      webSocketService.subscribe(job_id);

      return response.data;
    } catch (err) {
      actions.setError(err.message);
      throw err; // Re-throw for the component to handle if needed
    }
  },
};