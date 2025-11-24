import React, { useState, useEffect, useCallback } from 'react';
import { GeoJSON, useMap, useMapEvents } from 'react-leaflet';
import { debounce } from 'lodash';
import { layerAPI } from '../api/layerAPI.js';
import { AlertTriangle } from 'lucide-react';

const LayerErrorIndicator = ({ message }) => (
  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-red-100 text-red-700 p-2 text-xs rounded shadow-lg flex items-center gap-2">
    <AlertTriangle className="h-4 w-4" /> {message}
  </div>
);


const DynamicGeoJSONLayer = React.memo(({ layer }) => {
  const map = useMap();
  const [geojsonData, setGeojsonData] = useState({ type: 'FeatureCollection', features: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasLoadedStatic, setHasLoadedStatic] = useState(false);

  const isStaticLayer = layer.type === 'analysis_result' && layer.dataUrl;

  const fetchData = useCallback(debounce(async () => {
    // For static layers, only fetch once
    if (isStaticLayer && hasLoadedStatic) {
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      // Check if this is an analysis result layer with a static file URL
      if (isStaticLayer) {
        // Fetch directly from static file URL
        const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
        const fullUrl = layer.dataUrl.startsWith('http') ? layer.dataUrl : `${baseUrl}${layer.dataUrl}`;
        const response = await fetch(fullUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch static layer: ${response.statusText}`);
        }
        const data = await response.json();
        setGeojsonData(data);
        setHasLoadedStatic(true);
      } else {
        // Regular layer - fetch via API with bbox/zoom
        const bounds = map.getBounds();
        const zoom = map.getZoom();
        const data = await layerAPI.fetchLayerData(layer.layerId, {
          bbox: { west: bounds.getWest(), south: bounds.getSouth(), east: bounds.getEast(), north: bounds.getNorth() },
          zoom: zoom
        });
        setGeojsonData(data);
      }
    } catch (err) {
      // layerAPI.fetchLayerData now returns empty collection instead of throwing
      // But handle any unexpected errors gracefully
      console.error(`Failed to fetch data for layer ${layer.layerId}:`, err);
      setGeojsonData({ type: 'FeatureCollection', features: [] });
      // Don't set error state for empty layers - they're valid
      if (err.message && !err.message.includes('404') && !err.message.toLowerCase().includes('not found')) {
        setError('Failed to load layer data.');
      }
    } finally {
      setIsLoading(false);
    }
  }, 300), [map, layer.layerId, layer.type, layer.dataUrl, isStaticLayer, hasLoadedStatic]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Subscribe to map events - fetchData will skip if it's a static layer that's already loaded
  useMapEvents({ moveend: fetchData, zoomend: fetchData });

  const onEachFeature = (feature, layerInstance) => {
    if (feature.properties) {
      const popupContent = `
        <div class="max-h-48 overflow-y-auto pr-2">
          <table class="w-full text-xs table-auto">
            <tbody>
              ${Object.entries(feature.properties)
                .map(([key, value]) => `
                  <tr>
                    <td class="font-bold p-1 pr-3 align-top">${key}</td>
                    <td class="p-1 break-words">${value ?? 'N/A'}</td>
                  </tr>`)
                .join('')}
            </tbody>
          </table>
        </div>`;
      layerInstance.bindPopup(popupContent, { maxWidth: 400 });
    }
  };

  if (isLoading) return null; 
  if (error) return <LayerErrorIndicator message={error} />;

  return <GeoJSON key={layer.layerId} data={geojsonData} style={layer.style} onEachFeature={onEachFeature} />;
});
DynamicGeoJSONLayer.displayName = 'DynamicGeoJSONLayer';

export default DynamicGeoJSONLayer;
