import React, {  useRef, useEffect, useState } from 'react';
import { MapContainer, TileLayer} from 'react-leaflet';
import { Layers, ZoomIn, ZoomOut, Home, Loader, AlertTriangle, Maximize, Minimize, MessageSquare, X, BarChart3 } from 'lucide-react';
import L from 'leaflet';
import { useAppContext } from '../hooks/AppContext';
import LayerControl from './LayerControl';
import MapController from './MapController';
import DynamicGeoJSONLayer from './DynamicGeoJSONLayer';
import ChatWindow from './ChatWindow';
import ResultPanel from './ResultPanel';


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

  const { mapLayers, isAgentLoading, agentStatusMessage, mapFullscreen, results } = state;
  const mapRef = useRef(null);
  const mapContainerRef = useRef(null);
  const [showFullscreenChat, setShowFullscreenChat] = useState(false);
  const [showFullscreenResults, setShowFullscreenResults] = useState(false);

  // Handle fullscreen change
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!document.fullscreenElement;
      if (!isCurrentlyFullscreen && mapFullscreen) {
        // Exiting fullscreen - update state
        actions.toggleMapFullscreen();
        // Force map to invalidate size after exiting fullscreen
        setTimeout(() => {
          if (mapRef.current) {
            mapRef.current.invalidateSize();
          }
        }, 100);
      } else if (isCurrentlyFullscreen && !mapFullscreen) {
        // Entering fullscreen - update state
        actions.toggleMapFullscreen();
        // Force map to invalidate size after entering fullscreen
        setTimeout(() => {
          if (mapRef.current) {
            mapRef.current.invalidateSize();
          }
        }, 100);
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [mapFullscreen, actions]);

  const toggleFullscreen = async () => {
    if (!mapContainerRef.current) return;
    
    try {
      if (!mapFullscreen) {
        await mapContainerRef.current.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.error('Error toggling fullscreen:', err);
    }
  };

  return (
    <div 
      ref={mapContainerRef}
      className={`relative bg-gray-200 rounded-lg shadow-inner overflow-hidden ${
        mapFullscreen ? 'fixed inset-0 z-[9999] rounded-none' : 'h-full w-full'
      }`}
    >
      <div className="absolute top-4 left-4 z-[1000] flex flex-col gap-2">
        <div className="bg-white rounded-md shadow-lg p-1 space-y-1">
          <button onClick={() => mapRef.current?.zoomIn()} className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded" title="Zoom In"><ZoomIn className="h-5 w-5" /></button>
          <button onClick={() => mapRef.current?.zoomOut()} className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded" title="Zoom Out"><ZoomOut className="h-5 w-5" /></button>
          <button onClick={() => actions.setMapView(homeCoords, homeZoom, null)} className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded" title="Reset View"><Home className="h-5 w-5" /></button>
          <div className="border-t border-gray-200 my-1"></div>
          <button 
            onClick={toggleFullscreen} 
            className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded" 
            title={mapFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
          >
            {mapFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
          </button>
          {mapFullscreen && (
            <>
              <div className="border-t border-gray-200 my-1"></div>
              <button 
                onClick={() => setShowFullscreenChat(!showFullscreenChat)} 
                className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded" 
                title={showFullscreenChat ? "Close Chat" : "Open Chat"}
              >
                {showFullscreenChat ? <X className="h-5 w-5" /> : <MessageSquare className="h-5 w-5" />}
              </button>
              {results && (
                <button 
                  onClick={() => setShowFullscreenResults(!showFullscreenResults)} 
                  className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded" 
                  title={showFullscreenResults ? "Close Results" : "Open Results"}
                >
                  {showFullscreenResults ? <X className="h-5 w-5" /> : <BarChart3 className="h-5 w-5" />}
                </button>
              )}
            </>
          )}
        </div>
      </div>
      <LayerControl />
      <MapContainer 
        center={state.mapCenter} 
        zoom={state.mapZoom} 
        style={{ height: '100%', width: '100%', backgroundColor: '#f0f0f0' }} 
        ref={mapRef} 
        zoomControl={false}
        key={mapFullscreen ? 'fullscreen' : 'normal'} // Force remount on fullscreen change
      >
        <MapController />
        <TileLayer 
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
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
      
      {/* Fullscreen Chat Widget */}
      {mapFullscreen && showFullscreenChat && (
        <div className={`absolute top-0 bg-white shadow-2xl z-[2000] flex flex-col border-l max-w-full h-full ${
          showFullscreenResults ? 'right-96 w-96' : 'right-0 w-96'
        }`}>
          <div className="p-3 bg-white border-b flex justify-between items-center flex-shrink-0">
            <h3 className="text-sm font-semibold text-gray-900">Chat with AI</h3>
            <button
              onClick={() => setShowFullscreenChat(false)}
              className="p-1 rounded hover:bg-gray-100 flex-shrink-0"
              title="Close Chat"
            >
              <X className="h-4 w-4 text-gray-500" />
            </button>
          </div>
          <div className="flex-1 overflow-hidden min-w-0">
            <ChatWindow />
          </div>
        </div>
      )}
      
      {/* Fullscreen Results Panel */}
      {mapFullscreen && showFullscreenResults && results && (
        <div className={`absolute top-0 bg-white shadow-2xl z-[2000] flex flex-col border-l max-w-full h-full ${
          showFullscreenChat ? 'right-96 w-96' : 'right-0 w-96'
        }`}>
          <div className="p-3 bg-white border-b flex justify-between items-center flex-shrink-0">
            <h3 className="text-sm font-semibold text-gray-900">Analysis Results</h3>
            <button
              onClick={() => setShowFullscreenResults(false)}
              className="p-1 rounded hover:bg-gray-100 flex-shrink-0"
              title="Close Results"
            >
              <X className="h-4 w-4 text-gray-500" />
            </button>
          </div>
          <div className="flex-1 overflow-hidden min-w-0">
            <ResultPanel />
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
