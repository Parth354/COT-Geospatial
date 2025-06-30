import React, {  useRef } from 'react';
import { MapContainer, TileLayer} from 'react-leaflet';
import { Layers, ZoomIn, ZoomOut, Home, Loader, AlertTriangle } from 'lucide-react';
import L from 'leaflet';
import { useAppContext } from '../hooks/AppContext';
import LayerControl from './LayerControl';
import MapController from './MapController';
import DynamicGeoJSONLayer from './DynamicGeoJSONLayer';


delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

function MapViewer() {
  const { state, actions } = useAppContext();
  const homeCoords = [20.5937, 78.9629];
  const homeZoom = 5;

  const { mapLayers, isAgentLoading, agentStatusMessage } = state;
  const mapRef = useRef(null);

  return (
    <div className="relative h-full w-full bg-gray-200 rounded-lg shadow-inner overflow-hidden">
      <div className="absolute top-4 left-4 z-[1000] flex flex-col gap-2">
        <div className="bg-white rounded-md shadow-lg p-1 space-y-1">
          <button onClick={() => mapRef.current?.zoomIn()} className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded" title="Zoom In"><ZoomIn className="h-5 w-5" /></button>
          <button onClick={() => mapRef.current?.zoomOut()} className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded" title="Zoom Out"><ZoomOut className="h-5 w-5" /></button>
          <button onClick={() => actions.setMapView(homeCoords, homeZoom, null)} className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded" title="Reset View"><Home className="h-5 w-5" /></button>
        </div>
      </div>
      <LayerControl />
      <MapContainer center={state.mapCenter} zoom={state.mapZoom} style={{ height: '100%', width: '100%', backgroundColor: '#f0f0f0' }} ref={mapRef} zoomControl={false}>
        <MapController />
        <TileLayer attribution='© <a href="https://www.stadiamaps.com/" target="_blank">Stadia Maps</a> © <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>' url="https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png"/>
        {mapLayers.map((layer) => layer.visible ? <DynamicGeoJSONLayer key={layer.layerId} layer={layer} /> : null)}
      </MapContainer>
      {isAgentLoading && (
        <div className="absolute inset-0 bg-black bg-opacity-30 flex items-center justify-center z-[1001]">
          <div className="bg-white rounded-lg shadow-xl p-4 px-6 flex items-center gap-4">
            <Loader className="h-6 w-6 animate-spin text-blue-600" />
            <span className="text-gray-700 font-semibold">{agentStatusMessage || 'Processing analysis...'}</span>
          </div>
        </div>
      )}
      {mapLayers.length === 0 && !isAgentLoading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[500]">
          <div className="text-center text-gray-500 bg-white/80 backdrop-blur-sm p-8 rounded-lg shadow-lg">
            <Layers className="h-16 w-16 mx-auto mb-4 text-gray-400" />
            <p className="text-lg font-semibold text-gray-700">Map is Empty</p>
            <p className="text-sm">Upload data or get analysis results to see layers here.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function debounce(func, delay) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, delay);
  };
}

export default MapViewer;
