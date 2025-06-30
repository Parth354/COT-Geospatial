import {  api } from "./api";


export const resultsAPI = {
  getResults: async (jobId) => {
    try {
      if (!jobId) {
        throw new Error('Job ID is required to get results');
      }
      return api.get(`/api/results/${jobId}`).then(res => res.data);
    } catch (err) {
      console.error(`Failed to get results for job ${jobId}:`, err);
      throw err;
    }
  },

  downloadResult: async (jobId, filename) => {
    try {
      if (!jobId || !filename) {
        throw new Error('Job ID and filename are required for download');
      }
      
      return api.get(`/api/results/download/${jobId}/${filename}`, {
        responseType: 'blob',
      }).then(res => res.data);
    } catch (err) {
      console.error(`Failed to download result ${filename} for job ${jobId}:`, err);
      throw err;
    }
  },
};