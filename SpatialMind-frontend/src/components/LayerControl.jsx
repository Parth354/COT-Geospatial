import React, { useState } from 'react';
import {
  Layers,
  Eye,
  EyeOff,
  X,
  MapPin,
  GripVertical,
  PlusCircle,
  CheckCircle,
  AlertTriangle,
  Loader as Spinner
} from 'lucide-react';
import { useAppContext } from '../hooks/AppContext';

const getFallbackStyle = (layerName) => {
  let hash = 0;
  for (let i = 0; i < layerName.length; i++) hash = layerName.charCodeAt(i) + ((hash << 5) - hash);
  return '#' + ('00000' + (hash & 0xFFFFFF).toString(16)).slice(-6);
};

// ==============================================================================
// --- ✅ Available Dataset Item Component ---
// ==============================================================================
const AvailableDatasetItem = React.memo(({ dataset }) => {
  const { state, actions } = useAppContext();
  const isLayerAdded = state.mapLayers.some(l => l.layerId === dataset.dataset_id);

  const handleAddLayer = () => {
    if (isLayerAdded || dataset.status !== 'processed') return;
    const newLayer = {
      layerId: dataset.dataset_id,
      name: dataset.name,
      type: dataset.file_type || 'vector',
      visible: true,
      style: { color: getFallbackStyle(dataset.name), fillColor: getFallbackStyle(dataset.name), fillOpacity: 0.5 },
      bbox: null
    };
    actions.addMapLayer(newLayer);
  };

  const getStatusIcon = () => {
    switch (dataset.status) {
      case 'ingesting':
        return <Spinner className="h-4 w-4 animate-spin text-gray-400" title="Ingesting..." />;
      case 'processed':
        return <CheckCircle className="h-4 w-4 text-green-500" title="Ready" />;
      case 'ingestion_failed':
        return <AlertTriangle className="h-4 w-4 text-red-500" title="Failed" />;
      default:
        return <div className="h-4 w-4" />; // Placeholder for alignment
    }
  };

  return (
    <div className="p-2 flex items-center justify-between transition-colors bg-white">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {getStatusIcon()}
        <p className="font-medium text-sm text-gray-800 truncate" title={dataset.name}>{dataset.name}</p>
      </div>
      <button
        onClick={handleAddLayer}
        disabled={isLayerAdded || dataset.status !== 'processed'}
        className="p-1.5 text-gray-400 rounded disabled:opacity-30"
        title={isLayerAdded ? "Added to map" : "Add to map"}
      >
        {isLayerAdded ? <CheckCircle className="h-4 w-4 text-blue-600" /> : <PlusCircle className="h-4 w-4 hover:text-blue-600" />}
      </button>
    </div>
  );
});

// ==============================================================================
// --- Draggable Layer Item ---
// ==============================================================================
const LayerItem = React.memo(({ layer, onDragStart, onDragOver, onDragEnd }) => {
  const { actions } = useAppContext();
  const layerColor = layer.style?.fillColor || layer.style?.color || getFallbackStyle(layer.name);

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, layer.layerId)}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      className="group p-2 pr-3 bg-white flex items-center justify-between cursor-grab active:cursor-grabbing"
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <GripVertical className="h-5 w-5 text-gray-300 group-hover:text-gray-500" />
        <div className="w-3 h-3 rounded-full border" style={{ backgroundColor: layerColor, opacity: layer.style?.fillOpacity || 0.7 }} />
        <p className="font-medium text-sm text-gray-800 truncate" title={layer.name}>{layer.name}</p>
      </div>
      <div className="flex items-center space-x-1 pl-2">
        <button
          onClick={() => layer.bbox && actions.setMapView(null, null, layer.bbox)}
          disabled={!layer.bbox}
          className="p-1.5 text-gray-400 hover:text-blue-600 rounded disabled:opacity-30"
        >
          <MapPin className="h-4 w-4" />
        </button>
        <button
          onClick={() => actions.toggleLayerVisibility(layer.layerId)}
          className="p-1.5 text-gray-400 hover:text-gray-800 rounded"
        >
          {layer.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </button>
        <button
          onClick={() => actions.removeMapLayer(layer.layerId)}
          className="p-1.5 text-gray-400 hover:text-red-600 rounded"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
});

// ==============================================================================
// --- ✅ Main LayerControl Component ---
// ==============================================================================
function LayerControl() {
  const { state, actions } = useAppContext();
  const [isOpen, setIsOpen] = useState(false);
  const [draggedLayerId, setDraggedLayerId] = useState(null);

  const { mapLayers = [], uploadedDatasets = [] } = state;
  const reversedLayers = [...mapLayers].reverse();
  const hasContent = mapLayers.length > 0 || uploadedDatasets.length > 0;

  // Drag and Drop handlers
  const handleDragStart = (e, layerId) => setDraggedLayerId(layerId);

  const handleDragOver = (e) => e.preventDefault();

  const handleDrop = (e, targetLayerId) => {
    e.preventDefault();
    if (draggedLayerId && draggedLayerId !== targetLayerId) {
      actions.reorderLayers(draggedLayerId, targetLayerId);
    }
    setDraggedLayerId(null);
  };

  const handleDragEnd = () => setDraggedLayerId(null);

  return (
    <div className="absolute top-4 right-4 z-[1000]">
      <div className="relative">
        <button onClick={() => setIsOpen(!isOpen)} className="bg-white rounded-md shadow-lg p-2 hover:bg-gray-100" aria-expanded={isOpen}>
          <Layers className="h-5 w-5 text-gray-800" />
          {hasContent && (
            <span className="absolute -top-2 -right-2 bg-blue-600 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center border-2 border-white">
              {mapLayers.length}
            </span>
          )}
        </button>

        {isOpen && (
          <div className="absolute top-full mt-2 right-0 bg-gray-50 rounded-lg shadow-xl border w-80 max-h-[70vh] flex flex-col overflow-hidden">
            <div className="p-3 border-b bg-white flex items-center justify-between">
              <h3 className="font-semibold text-gray-800">Layers & Datasets</h3>
              <button onClick={() => setIsOpen(false)} className="p-1 text-gray-400 hover:text-gray-700 rounded-full hover:bg-gray-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="overflow-y-auto">
              <div className="p-2 pt-3 text-xs font-bold text-gray-500 uppercase tracking-wider">On Map ({reversedLayers.length})</div>
              {reversedLayers.length === 0 ? (
                <div className="px-4 py-2 text-center text-gray-500 text-xs">No active layers.</div>
              ) : (
                <div className="divide-y" onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, null)}>
                  {reversedLayers.map((layer) => (
                    <div key={layer.layerId} onDrop={(e) => handleDrop(e, layer.layerId)} className={draggedLayerId === layer.layerId ? 'opacity-50' : ''}>
                      <LayerItem
                        layer={layer}
                        onDragStart={handleDragStart}
                        onDragOver={handleDragOver}
                        onDragEnd={handleDragEnd}
                      />
                    </div>
                  ))}
                </div>
              )}

              <div className="p-2 pt-4 text-xs font-bold text-gray-500 uppercase tracking-wider border-t mt-2">Available Datasets ({uploadedDatasets.length})</div>
              {uploadedDatasets.length === 0 ? (
                <div className="px-4 py-2 text-center text-gray-500 text-xs">Upload a dataset to begin.</div>
              ) : (
                <div className="divide-y">
                  {uploadedDatasets.map(d => <AvailableDatasetItem key={d.dataset_id} dataset={d} />)}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default LayerControl;
