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

  const fetchData = useCallback(debounce(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const bounds = map.getBounds();
      const zoom = map.getZoom();
      const data = await layerAPI.fetchLayerData(layer.layerId, {
        bbox: { west: bounds.getWest(), south: bounds.getSouth(), east: bounds.getEast(), north: bounds.getNorth() },
        zoom: zoom
      });
      setGeojsonData(data);
    } catch (err) {
      if (err.message && (err.message.includes('404') || err.message.toLowerCase().includes('not found'))) {
        setGeojsonData({ type: 'FeatureCollection', features: [] });
        console.warn(`Layer ${layer.layerId} has no features in the current view (404).`);
      } else {
        console.error(`Failed to fetch data for layer ${layer.layerId}:`, err);
        setError('Failed to load layer data.');
      }
    } finally {
      setIsLoading(false);
    }
  }, 300), [map, layer.layerId]);

  useMapEvents({ moveend: fetchData, zoomend: fetchData });

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
