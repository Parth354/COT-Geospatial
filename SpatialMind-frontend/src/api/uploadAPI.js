import { api } from "./api";

export const uploadAPI = {
  /**
   * Uploads a file and, on success, dispatches an action to add the new dataset to the state.
   * @param {{ file: File, metadata: object, onProgress: function }} params - The upload parameters.
   * @param {object} actions - The actions object from `useAppActions`.
   */
  uploadFile: async ({ file, metadata = {}, onProgress }, actions) => {
    try {
      // Validate file before upload
      if (!file) {
        throw new Error('No file provided for upload');
      }
      
      if (file.size === 0) {
        throw new Error('Cannot upload empty file');
      }

      // Check file size (e.g., 100MB limit)
      const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
      if (file.size > MAX_FILE_SIZE) {
        throw new Error(`File size (${(file.size / 1024 / 1024).toFixed(2)}MB) exceeds maximum allowed size (${MAX_FILE_SIZE / 1024 / 1024}MB)`);
      }

      const formData = new FormData();
      formData.append('file', file);
      formData.append('metadata', JSON.stringify({
        name: metadata.name || file.name,
        description: metadata.description || '',
      }));

      const response = await api.post('/api/upload/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total && onProgress) {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            onProgress(percentCompleted);
          }
        },
      });

      // On success, automatically add the new dataset to the global state
      actions.addDataset(response.data);
      actions.addNotification({ type: 'success', message: `'${response.data.name}' uploaded successfully.` });
      
      return response.data;
    } catch (err) {
      console.error('Upload failed:', err);
      actions.setError(err.message);
      actions.addNotification({ type: 'error', message: `Upload failed: ${err.message}` });
      throw err;
    }
  },
};