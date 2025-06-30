/**
 * Utility function to check if a dataset is ready to be added to the map
 * @param {object} dataset - The dataset object
 * @returns {boolean} - Whether the dataset can be added to the map
 */
export const canAddToMap = (dataset) => {
  if (!dataset) return false;
  
  // Raster files (TIFF/COG) can be added immediately after upload
  if (dataset.file_type && (dataset.file_type.toLowerCase().includes('tiff') || dataset.file_type.toLowerCase().includes('cog'))) {
    return true;
  }
  
  // Vector files need to be processed first
  return dataset.status === 'processed';
};