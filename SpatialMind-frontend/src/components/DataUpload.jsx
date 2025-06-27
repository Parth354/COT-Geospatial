import React, { useState, useRef } from 'react'
import { Upload, FileText, X, CheckCircle, AlertCircle, Loader } from 'lucide-react'
import { useAppContext } from '../hooks/useAppContext'
import { uploadAPI, datasetsAPI } from '../services/api' 

function DataUpload() {
  const { state, dispatch } = useAppContext()
  const [dragActive, setDragActive] = useState(false)
  const [uploadProgress, setUploadProgress] = useState({})
  const fileInputRef = useRef(null)

  const supportedFormats = [
    { ext: '.geojson', type: 'GeoJSON', description: 'Vector data format' },
    { ext: '.shp', type: 'Shapefile', description: 'Vector data format (with .dbf, .shx)' },
    { ext: '.zip', type: 'Shapefile Archive', description: 'Zipped shapefile bundle' },
    { ext: '.tif', type: 'GeoTIFF', description: 'Raster data format' },
    { ext: '.tiff', type: 'GeoTIFF', description: 'Raster data format' },
    { ext: '.kml', type: 'KML', description: 'Google Earth format' },
    { ext: '.csv', type: 'CSV', description: 'Tabular data with coordinates' }
  ]

  const validateFile = (file) => {
    const fileName = file.name.toLowerCase()
    const validExtensions = supportedFormats.map(f => f.ext)
    const isValidFormat = validExtensions.some(ext => fileName.endsWith(ext))

    if (!isValidFormat) {
      return { valid: false, error: 'Unsupported file format' }
    }

    if (file.size > 100 * 1024 * 1024) {  // API spec: max 100MB
      return { valid: false, error: 'File size exceeds 100MB limit' }
    }

    return { valid: true }
  }

  const handleFiles = async (files) => {
    const fileList = Array.from(files)

    for (const file of fileList) {
      const validation = validateFile(file)

      if (!validation.valid) {
        dispatch({
          type: 'SET_ERROR',
          payload: `${file.name}: ${validation.error}`
        })
        continue
      }

      await processFile(file)
    }
  }

  const processFile = async (file) => {
    const fileId = `${Date.now()}-${file.name}`

    setUploadProgress(prev => ({
      ...prev,
      [fileId]: { progress: 0, status: 'uploading' }
    }))

    try {
      // Call upload API with progress callback - matches API spec
      const response = await uploadAPI.uploadFile(file, {
        name: file.name,
        description: '',
        tags: []
      }, (progress) => {
        setUploadProgress(prev => ({
          ...prev,
          [fileId]: { progress, status: 'uploading' }
        }))
      })

      setUploadProgress(prev => ({
        ...prev,
        [fileId]: { progress: 100, status: 'completed' }
      }))

      // Add dataset to state using API response structure from spec
      dispatch({
        type: 'ADD_DATASET',
        payload: {
          datasetId: response.dataset_id,        // API spec uses snake_case
          name: response.name,
          fileType: response.file_type,          // API spec uses snake_case
          sizeMb: response.size_mb,              // API spec uses snake_case
          featureCount: response.feature_count,  // API spec uses snake_case
          bbox: response.bbox,
          crs: response.crs,
          uploadTime: response.upload_time,      // API spec uses snake_case
          status: response.status,
          tags: response.tags || []
        }
      })

      // Note: API spec doesn't include map layer in upload response
      // Map layers are created through analysis results, not uploads

      // Clear progress after delay
      setTimeout(() => {
        setUploadProgress(prev => {
          const updated = { ...prev }
          delete updated[fileId]
          return updated
        })
      }, 3000)

    } catch (error) {
      setUploadProgress(prev => ({
        ...prev,
        [fileId]: { progress: 0, status: 'error', error: error.message }
      }))

      dispatch({
        type: 'SET_ERROR',
        payload: `Failed to upload ${file.name}: ${error.message}`
      })
    }
  }

  const handleDrag = (e) => { e.preventDefault(); e.stopPropagation() }
  const handleDragIn = (e) => { e.preventDefault(); e.stopPropagation(); setDragActive(true) }
  const handleDragOut = (e) => { e.preventDefault(); e.stopPropagation(); setDragActive(false) }
  const handleDrop = (e) => {
    e.preventDefault(); e.stopPropagation(); setDragActive(false)
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files)
  }

  const handleInputChange = (e) => {
    if (e.target.files) handleFiles(e.target.files)
  }

  const removeDataset = async (datasetId) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true })
      
      // Call API to delete dataset
      await datasetsAPI.deleteDataset(datasetId)
      
      // Remove from state
      dispatch({ type: 'REMOVE_DATASET', payload: datasetId })
      
      // Also remove associated map layer if exists
      const associatedLayer = state.mapLayers.find(layer => 
        layer.datasetId === datasetId || layer.name === state.uploadedDatasets.find(d => d.datasetId === datasetId)?.name
      )
      if (associatedLayer) {
        dispatch({ type: 'REMOVE_LAYER', payload: associatedLayer.layerId })
      }
      
    } catch (error) {
      dispatch({
        type: 'SET_ERROR',
        payload: `Failed to delete dataset: ${error.message}`
      })
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false })
    }
  }

  return (
    <div className="space-y-6">
      {/* Upload UI */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Upload Geospatial Data</h3>
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
          }`}
          onDragEnter={handleDragIn}
          onDragLeave={handleDragOut}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <Upload className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <p className="text-lg font-medium text-gray-900 mb-2">Drop files here or click to browse</p>
          <p className="text-sm text-gray-500 mb-4">Support for GeoJSON, Shapefiles, GeoTIFF, KML, and CSV files (max 100MB)</p>
          <button onClick={() => fileInputRef.current?.click()} className="btn btn-primary">
            Choose Files
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".geojson,.shp,.zip,.tif,.tiff,.kml,.csv"
            onChange={handleInputChange}
            className="hidden"
          />
        </div>

        {/* Supported Formats */}
        <div className="mt-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Supported Formats</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {supportedFormats.map((format) => (
              <div key={format.ext} className="text-xs bg-gray-50 rounded p-2">
                <div className="font-medium text-gray-900">{format.type}</div>
                <div className="text-gray-500">{format.description}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Upload Progress */}
      {Object.keys(uploadProgress).length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Upload Progress</h4>
          <div className="space-y-2">
            {Object.entries(uploadProgress).map(([fileId, progress]) => (
              <div key={fileId} className="flex items-center space-x-3">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-900">{fileId.split('-').slice(1).join('-')}</span>
                    <span className="text-xs text-gray-500">{progress.progress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all duration-300 ${
                        progress.status === 'completed' ? 'bg-green-500' :
                        progress.status === 'error' ? 'bg-red-500' : 'bg-blue-500'
                      }`}
                      style={{ width: `${progress.progress}%` }}
                    />
                  </div>
                  {progress.error && (
                    <p className="text-xs text-red-600 mt-1">{progress.error}</p>
                  )}
                </div>
                {progress.status === 'uploading' && <Loader className="h-4 w-4 animate-spin text-blue-500" />}
                {progress.status === 'completed' && <CheckCircle className="h-4 w-4 text-green-500" />}
                {progress.status === 'error' && <AlertCircle className="h-4 w-4 text-red-500" />}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Uploaded Datasets */}
      {state.uploadedDatasets.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Uploaded Datasets</h4>
          <div className="space-y-2">
            {state.uploadedDatasets.map((dataset) => (
              <div key={dataset.datasetId} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                <div className="flex items-center space-x-3">
                  <FileText className="h-5 w-5 text-gray-400" />
                  <div>
                    <div className="text-sm font-medium text-gray-900">{dataset.name}</div>
                    <div className="text-xs text-gray-500">
                      {dataset.fileType} • {dataset.sizeMb?.toFixed(2)} MB
                      {dataset.featureCount && ` • ${dataset.featureCount} features`}
                      {dataset.crs && ` • ${dataset.crs}`}
                    </div>
                    {dataset.tags && dataset.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {dataset.tags.map((tag, index) => (
                          <span key={index} className="px-1 py-0.5 text-xs bg-blue-100 text-blue-800 rounded">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <span className={`px-2 py-1 rounded text-xs ${
                    dataset.status === 'ready' ? 'bg-green-100 text-green-800' : 
                    dataset.status === 'processing' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {dataset.status}
                  </span>
                  <button 
                    onClick={() => removeDataset(dataset.datasetId)} 
                    className="p-1 rounded hover:bg-red-100 text-red-600"
                    disabled={state.loading}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default DataUpload