import React, { useState, useEffect, useCallback } from 'react';
import { GeoJSON, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { debounce } from 'lodash';
import { layerAPI } from '../api/layerAPI.js';
import { AlertTriangle } from 'lucide-react';
import { isFloodDomain, getFloodFeatureColor, getDefaultLayerStyle, HAZARD_COLORS } from '../utils/hazardStyling.js';

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
    if (isStaticLayer && hasLoadedStatic) {
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      if (isStaticLayer) {
        const baseUrl = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';
        const fullUrl = layer.dataUrl.startsWith('http') ? layer.dataUrl : `${baseUrl}${layer.dataUrl}`;
        const response = await fetch(fullUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch static layer: ${response.statusText}`);
        }
        const data = await response.json();
        setGeojsonData(data);
        setHasLoadedStatic(true);
      } else {
        const bounds = map.getBounds();
        const zoom = map.getZoom();
        const data = await layerAPI.fetchLayerData(layer.layerId, {
          bbox: { west: bounds.getWest(), south: bounds.getSouth(), east: bounds.getEast(), north: bounds.getNorth() },
          zoom: zoom
        });
        setGeojsonData(data);
      }
    } catch (err) {
      console.error(`Failed to fetch data for layer ${layer.layerId}:`, err);
      setGeojsonData({ type: 'FeatureCollection', features: [] });
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

  useMapEvents({ moveend: fetchData, zoomend: fetchData });

  // Dynamic feature-level styling based on attribute properties (color, fillColor, opacity)
  const getFeatureStyle = (feature) => {
    const props = feature?.properties || {};
    const isPolygon = feature?.geometry?.type?.includes('Polygon');
    const isFlood = isFloodDomain(layer?.name, props);

    let featColor;
    let strokeColor;

    if (isFlood) {
      // Map directly to blue flood scale matching MapLegend.jsx
      featColor = getFloodFeatureColor(props);
      strokeColor = HAZARD_COLORS.flood.stroke;
    } else if (props.color && props.color !== '#ff5722' && props.color !== '#ef4444') {
      featColor = props.color;
      strokeColor = props.color;
    } else if (props.fillColor && props.fillColor !== '#ff5722' && props.fillColor !== '#ef4444') {
      featColor = props.fillColor;
      strokeColor = props.fillColor;
    } else if (layer?.style?.fillColor || layer?.style?.color) {
      const candidate = layer?.style?.fillColor || layer?.style?.color;
      featColor = candidate;
      strokeColor = layer?.style?.color || candidate;
    } else {
      const defaultStyle = getDefaultLayerStyle(layer?.name);
      featColor = defaultStyle.fillColor;
      strokeColor = defaultStyle.color;
    }

    const featOpacity = props.opacity ?? props.fillOpacity ?? layer?.style?.fillOpacity ?? 0.65;

    return {
      color: strokeColor,
      fillColor: featColor,
      fillOpacity: featOpacity,
      weight: isPolygon ? 1.5 : 2,
      opacity: 0.95,
    };
  };

  // Render point features as dynamic circle markers with color classification
  const pointToLayer = (feature, latlng) => {
    const props = feature?.properties || {};
    const isFlood = isFloodDomain(layer?.name, props);

    let color;
    let radius = 7;

    if (isFlood) {
      color = getFloodFeatureColor(props);
      if (props.evacuation_center) {
        radius = 9;
      } else if (props.monitoring_station) {
        radius = 8;
      }
    } else if (props.aqi || props.interpolated_aqi || props.forecast_aqi) {
      const val = props.forecast_aqi || props.interpolated_aqi || props.aqi;
      radius = Math.min(Math.max(val / 30, 6), 14);
      if (val > 300) color = '#7e0023';
      else if (val > 200) color = '#8f3f97';
      else if (val > 150) color = '#ff0000';
      else if (val > 100) color = '#ff7e00';
      else if (val > 50) color = '#ffff00';
      else color = '#00e400';
    } else if (props.total_frp_mw || props.frp) {
      const frp = props.total_frp_mw || props.frp;
      radius = Math.min(Math.max(frp / 25, 6), 16);
      if (frp > 300) color = '#7f1d1d';
      else if (frp > 150) color = '#ef4444';
      else if (frp > 50) color = '#f97316';
      else color = '#eab308';
    } else if (props.color && props.color !== '#ef4444' && props.color !== '#ff5722') {
      color = props.color;
    } else if (layer?.style?.color && layer?.style?.color !== '#ff5722') {
      color = layer.style.color;
    } else {
      color = getDefaultLayerStyle(layer?.name).fillColor;
    }

    return L.circleMarker(latlng, {
      radius: radius,
      fillColor: color,
      color: '#ffffff',
      weight: 2,
      opacity: 0.95,
      fillOpacity: 0.85,
    });
  };

  const onEachFeature = (feature, layerInstance) => {
    if (feature.properties) {
      const p = feature.properties;
      const title = p.station_name || p.cluster_id || p.district || p.name || p.aqi_category || p.flood_risk_level || p.weather_alert;
      const metric = p.interpolated_aqi ?? p.forecast_aqi ?? p.aqi ?? p.total_frp_mw ?? p.submerged_area_km2;

      // Hover tooltip
      if (title || metric !== undefined) {
        const tooltipText = title ? (metric !== undefined ? `${title}: ${metric}` : `${title}`) : `Value: ${metric}`;
        layerInstance.bindTooltip(tooltipText, { sticky: true });
      }

      // Detailed popup
      const popupContent = `
        <div class="max-h-56 overflow-y-auto pr-1">
          <div class="font-bold text-xs text-gray-800 pb-1 mb-1 border-b border-gray-200">
            ${title || 'Feature Inspection'}
          </div>
          <table class="w-full text-[11px] table-auto">
            <tbody>
              ${Object.entries(p)
                .filter(([k]) => k !== 'color' && k !== 'opacity')
                .map(([key, value]) => {
                  const displayValue = typeof value === 'object' && value !== null 
                    ? JSON.stringify(value) 
                    : (value !== undefined && value !== null ? String(value) : 'N/A');
                  return `
                  <tr>
                    <td class="font-semibold p-0.5 pr-2 align-top text-gray-600">${key}</td>
                    <td class="p-0.5 break-words text-gray-900">${displayValue}</td>
                  </tr>`;
                })
                .join('')}
            </tbody>
          </table>
        </div>`;
      layerInstance.bindPopup(popupContent, { maxWidth: 380 });
    }
  };

  if (isLoading) return null; 
  if (error) return <LayerErrorIndicator message={error} />;

  return (
    <GeoJSON 
      key={layer.layerId} 
      data={geojsonData} 
      style={getFeatureStyle} 
      pointToLayer={pointToLayer}
      onEachFeature={onEachFeature} 
    />
  );
});
DynamicGeoJSONLayer.displayName = 'DynamicGeoJSONLayer';

export default DynamicGeoJSONLayer;
