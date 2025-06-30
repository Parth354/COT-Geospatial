import {  api } from "./api";


export const datasetsAPI = {
  listDatasets: async () => {
    try {
      return api.get('/api/datasets/').then(res => res.data);
    } catch (err) {
      console.error('Failed to list datasets:', err);
      throw err;
    }
  },

  /**
   * Deletes a dataset and dispatches an action to remove it from the state.
   * @param {string} datasetId - The ID of the dataset to delete.
   * @param {object} actions - The actions object from `useAppActions`.
   */
  deleteDataset: async (datasetId, actions) => {
    try {
      if (!datasetId) {
        throw new Error('Dataset ID is required for deletion');
      }

      await api.delete(`/api/datasets/${datasetId}`);
      
      // On success, automatically remove the dataset from the global state
      actions.removeDataset(datasetId);
      actions.addNotification({ type: 'success', message: 'Dataset deleted successfully.' });
      
      return true;
    } catch (err) {
      console.error('Delete dataset failed:', err);
      actions.setError(err.message);
      actions.addNotification({ type: 'error', message: `Failed to delete dataset: ${err.message}` });
      throw err;
    }
  },
};