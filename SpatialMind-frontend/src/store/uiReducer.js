/**
 * Handles state related to the UI, such as map layers, datasets,
 * map view, and results panels.
 */
export function uiReducer(state, action) {
  switch (action.type) {
    case 'ADD_DATASET':
      if (state.uploadedDatasets.some(d => d.dataset_id === action.payload.dataset.dataset_id)) return state;
      return { ...state, uploadedDatasets: [...state.uploadedDatasets, action.payload.dataset]};

    case 'REMOVE_DATASET':
      return { ...state, uploadedDatasets: state.uploadedDatasets.filter(d => d.dataset_id !== action.payload.datasetId) };

    case 'UPDATE_DATASET_STATUS':
      return { ...state, uploadedDatasets: state.uploadedDatasets.map(d =>
          d.dataset_id === action.payload.datasetId ? { ...d, status: action.payload.status } : d
        )
      };

    case 'ADD_MAP_LAYER':
      if (state.mapLayers.some(l => l.layerId === action.payload.layer.layerId)) return state;
      return { ...state, mapLayers: [...state.mapLayers, action.payload.layer] };
      
    case 'REMOVE_MAP_LAYER':
      return { ...state, mapLayers: state.mapLayers.filter(l => l.layerId !== action.payload.layerId) };

    case 'TOGGLE_LAYER_VISIBILITY':
      return { ...state, mapLayers: state.mapLayers.map(l => l.layerId === action.payload.layerId ? { ...l, visible: !l.visible } : l ) };

    case 'REORDER_MAP_LAYERS': { // ADDED THIS ACTION
      const { sourceId, targetId } = action.payload;
      const layers = [...state.mapLayers];
      const sourceIndex = layers.findIndex(l => l.layerId === sourceId);
      if (sourceIndex === -1) return state;
      const [removed] = layers.splice(sourceIndex, 1);
      const targetIndex = targetId ? layers.findIndex(l => l.layerId === targetId) : -1;
      if (targetIndex !== -1) {
        layers.splice(targetIndex, 0, removed);
      } else {
        layers.push(removed);
      }
      return { ...state, mapLayers: layers };
    }

    case 'SET_MAP_VIEW': {
      const { center, zoom, bounds } = action.payload;
      const nextMapCenter = (center !== null && center !== undefined) ? [...center] : state.mapCenter;
      return { ...state, mapCenter: nextMapCenter, mapZoom: zoom ?? state.mapZoom, mapFitBounds: bounds ?? null };
    }
      
    case 'SET_RESULTS':
      return { ...state, results: action.payload.results };
        
    default:
      return state;
  }
}