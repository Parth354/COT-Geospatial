import React, { useState } from 'react'
import { Layers, Eye, EyeOff, X, Info } from 'lucide-react'
import { useAppContext } from '../hooks/useAppContext'

function LayerControl() {
  const { state, actions } = useAppContext()
  const [isOpen, setIsOpen] = useState(false)

  const toggleLayer = (layerId) => {
    const updatedLayers = state.mapLayers.map(layer =>
      layer.id === layerId ? { ...layer, visible: !layer.visible } : layer
    )
    actions.setMapLayers(updatedLayers)
  }

  const removeLayer = (layerId) => {
    actions.removeMapLayer(layerId)
  }

  const getLayerColor = (layerType) => {
    const colors = {
      'flood-zones': 'bg-red-500',
      'flood-high-risk': 'bg-red-600',
      'flood-medium-risk': 'bg-yellow-500',
      'flood-low-risk': 'bg-yellow-300',
      'hospitals': 'bg-green-500',
      'roads': 'bg-gray-500',
      'boundaries': 'bg-gray-700',
      'default': 'bg-blue-500'
    }
    return colors[layerType] || colors.default
  }

  const getFeatureCount = (layer) => {
    if (layer.data && layer.data.features) {
      return layer.data.features.length
    }
    return 0
  }

  return (
    <div className="relative">
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="bg-white rounded-lg shadow-lg p-2 hover:bg-gray-50 transition-colors"
        title="Layer Control"
      >
        <Layers className="h-5 w-5 text-gray-700" />
        {state.mapLayers.length > 0 && (
          <span className="absolute -top-1 -right-1 bg-primary-600 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
            {state.mapLayers.length}
          </span>
        )}
      </button>

      {/* Layer Panel */}
      {isOpen && (
        <div className="absolute top-12 right-0 bg-white rounded-lg shadow-xl border border-gray-200 w-80 max-h-96 overflow-hidden">
          {/* Header */}
          <div className="p-3 border-b border-gray-200 flex items-center justify-between">
            <h3 className="font-medium text-gray-900">Map Layers</h3>
            <button
              onClick={() => setIsOpen(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Layer List */}
          <div className="max-h-80 overflow-y-auto">
            {state.mapLayers.length === 0 ? (
              <div className="p-4 text-center text-gray-500">
                <Layers className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                <p className="text-sm">No layers available</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {state.mapLayers.map((layer) => (
                  <div key={layer.id} className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3 flex-1">
                        {/* Layer Color Indicator */}
                        <div className={`w-3 h-3 rounded-full ${getLayerColor(layer.type)}`}></div>
                        
                        {/* Layer Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2">
                            <span className="font-medium text-sm text-gray-900 truncate">
                              {layer.name}
                            </span>
                            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                              {getFeatureCount(layer)} features
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 truncate mt-1">
                            {layer.description || `Type: ${layer.type}`}
                          </p>
                        </div>
                      </div>

                      {/* Layer Controls */}
                      <div className="flex items-center space-x-1">
                        <button
                          onClick={() => toggleLayer(layer.id)}
                          className="p-1 text-gray-400 hover:text-gray-600 rounded"
                          title={layer.visible ? 'Hide layer' : 'Show layer'}
                        >
                          {layer.visible ? (
                            <Eye className="h-4 w-4" />
                          ) : (
                            <EyeOff className="h-4 w-4" />
                          )}
                        </button>
                        
                        <button
                          onClick={() => removeLayer(layer.id)}
                          className="p-1 text-gray-400 hover:text-red-600 rounded"
                          title="Remove layer"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {/* Layer Metadata */}
                    {layer.metadata && (
                      <div className="mt-2 text-xs text-gray-500">
                        <div className="flex items-center space-x-4">
                          {layer.metadata.source && (
                            <span>Source: {layer.metadata.source}</span>
                          )}
                          {layer.metadata.date && (
                            <span>Date: {layer.metadata.date}</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {state.mapLayers.length > 0 && (
            <div className="p-3 border-t border-gray-200 bg-gray-50">
              <div className="flex items-center text-xs text-gray-500">
                <Info className="h-3 w-3 mr-1" />
                Click layers to toggle visibility
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default LayerControl;