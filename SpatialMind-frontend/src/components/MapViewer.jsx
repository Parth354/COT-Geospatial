import React, { useRef, useEffect, useState, useCallback } from 'react';
import { MapContainer, TileLayer, useMapEvents } from 'react-leaflet';
import {
  Layers, ZoomIn, ZoomOut, Home, Loader, AlertTriangle, Maximize, Minimize,
  MessageSquare, X, BarChart3, Globe, Compass, Focus, Map as MapIcon, Check
} from 'lucide-react';
import L from 'leaflet';
import { useAppContext } from '../hooks/AppContext';
import LayerControl from './LayerControl';
import MapController from './MapController';
import DynamicGeoJSONLayer from './DynamicGeoJSONLayer';
import MapLegend from './MapLegend';
import ChatWindow from './ChatWindow';
import ResultPanel from './ResultPanel';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// 100% Free Public Basemap Catalog (Zero API Keys Required)
const BASEMAP_PRESETS = {
  osm_standard: {
    id: 'osm_standard',
    name: 'OpenStreetMap Standard',
    category: 'Open Geographic (Free)',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
  },
  esri_satellite: {
    id: 'esri_satellite',
    name: 'ESRI World Imagery',
    category: 'High-Res Satellite (Free)',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and GIS User Community',
    maxZoom: 19
  },
  topo: {
    id: 'topo',
    name: 'OpenTopoMap',
    category: 'Topographic Contours (Free)',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, SRTM | <a href="https://opentopomap.org">OpenTopoMap</a>',
    maxZoom: 17
  }
};

// Map HUD Internal Event Tracker
function MapHUDTracker({ onCursorMove, onZoomChange }) {
  useMapEvents({
    mousemove(e) {
      if (e?.latlng) {
        onCursorMove(e.latlng.lat, e.latlng.lng);
      }
    },
    zoomend(e) {
      onZoomChange(e.target.getZoom());
    }
  });
  return null;
}

function MapViewer() {
  const { state, actions } = useAppContext();
  const homeCoords = [20.5937, 78.9629];
  const homeZoom = 5;

  const { mapLayers, isAgentLoading, agentStatusMessage, mapFullscreen, results } = state;
  const mapRef = useRef(null);
  const mapContainerRef = useRef(null);
  const [showFullscreenChat, setShowFullscreenChat] = useState(false);
  const [showFullscreenResults, setShowFullscreenResults] = useState(false);

  // Basemap & HUD state
  const [activeBasemapKey, setActiveBasemapKey] = useState('osm_standard');
  const [showBasemapMenu, setShowBasemapMenu] = useState(false);
  const [cursorPos, setCursorPos] = useState({ lat: 20.5937, lng: 78.9629 });
  const [currentZoom, setCurrentZoom] = useState(homeZoom);

  const activeBasemap = BASEMAP_PRESETS[activeBasemapKey] || BASEMAP_PRESETS.osm_standard;

  const handleCursorMove = useCallback((lat, lng) => {
    setCursorPos({ lat, lng });
  }, []);

  const handleZoomChange = useCallback((zoom) => {
    setCurrentZoom(zoom);
  }, []);

  // Fit all active layers on the map
  const handleFitAllLayers = () => {
    if (!mapLayers || mapLayers.length === 0) {
      actions.setMapView(homeCoords, homeZoom, null);
      return;
    }

    const bboxes = mapLayers
      .filter((l) => l.visible && l.bbox)
      .map((l) => l.bbox);

    if (bboxes.length > 0) {
      let south = Math.min(...bboxes.map((b) => b.south));
      let west = Math.min(...bboxes.map((b) => b.west));
      let north = Math.max(...bboxes.map((b) => b.north));
      let east = Math.max(...bboxes.map((b) => b.east));

      if (isFinite(south) && isFinite(west) && isFinite(north) && isFinite(east)) {
        actions.setMapView(null, null, { south, west, north, east });
        return;
      }
    }

    actions.setMapView(homeCoords, homeZoom, null);
  };

  // Handle fullscreen change
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!document.fullscreenElement;
      if (!isCurrentlyFullscreen && mapFullscreen) {
        actions.toggleMapFullscreen();
        setTimeout(() => {
          if (mapRef.current) {
            mapRef.current.invalidateSize();
          }
        }, 100);
      } else if (isCurrentlyFullscreen && !mapFullscreen) {
        actions.toggleMapFullscreen();
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
      className={`relative bg-slate-900 rounded-lg shadow-inner overflow-hidden ${
        mapFullscreen ? 'fixed inset-0 z-[9999] rounded-none' : 'h-full w-full'
      }`}
    >
      {/* Floating Map Navigation Toolbar */}
      <div className="absolute top-4 left-4 z-[1000] flex items-start gap-2">
        <div className="bg-white/95 backdrop-blur-xs rounded-xl shadow-lg p-1 space-y-1 border border-slate-200">
          <button
            onClick={() => mapRef.current?.zoomIn()}
            className="w-8 h-8 flex items-center justify-center text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            onClick={() => mapRef.current?.zoomOut()}
            className="w-8 h-8 flex items-center justify-center text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            onClick={() => actions.setMapView(homeCoords, homeZoom, null)}
            className="w-8 h-8 flex items-center justify-center text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            title="Reset to National Extent"
          >
            <Home className="h-4 w-4" />
          </button>
          <button
            onClick={handleFitAllLayers}
            className="w-8 h-8 flex items-center justify-center text-slate-700 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            title="Fit Extent to Active Layers"
          >
            <Focus className="h-4 w-4" />
          </button>

          <div className="border-t border-slate-200 my-1"></div>

          {/* Basemap Switcher Toggle */}
          <button
            onClick={() => setShowBasemapMenu(!showBasemapMenu)}
            className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
              showBasemapMenu ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:text-indigo-600 hover:bg-slate-100'
            }`}
            title="Switch Basemap"
          >
            <Globe className="h-4 w-4" />
          </button>

          <button 
            onClick={toggleFullscreen} 
            className="w-8 h-8 flex items-center justify-center text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer" 
            title={mapFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
          >
            {mapFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </button>

          {mapFullscreen && (
            <>
              <div className="border-t border-slate-200 my-1"></div>
              <button 
                onClick={() => setShowFullscreenChat(!showFullscreenChat)} 
                className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
                  showFullscreenChat ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-100'
                }`}
                title={showFullscreenChat ? "Close Console" : "Open Spatial Console"}
              >
                {showFullscreenChat ? <X className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
              </button>
              {results && (
                <button 
                  onClick={() => setShowFullscreenResults(!showFullscreenResults)} 
                  className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
                    showFullscreenResults ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-100'
                  }`}
                  title={showFullscreenResults ? "Close Results" : "Open Results"}
                >
                  {showFullscreenResults ? <X className="h-4 w-4" /> : <BarChart3 className="h-4 w-4" />}
                </button>
              )}
            </>
          )}
        </div>

        {/* Basemap Selection Flyout */}
        {showBasemapMenu && (
          <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl p-3 border border-slate-200 w-64 animate-fade-in z-[1001]">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <MapIcon className="h-3.5 w-3.5 text-indigo-600" />
                Basemap Layer
              </span>
              <button
                onClick={() => setShowBasemapMenu(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="space-y-1.5">
              {Object.values(BASEMAP_PRESETS).map((bm) => {
                const isSelected = activeBasemapKey === bm.id;
                return (
                  <button
                    key={bm.id}
                    onClick={() => {
                      setActiveBasemapKey(bm.id);
                      setShowBasemapMenu(false);
                    }}
                    className={`w-full p-2 rounded-xl text-left transition-all flex items-center justify-between cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-50 border border-indigo-200 text-indigo-950 font-semibold'
                        : 'hover:bg-slate-100 border border-transparent text-slate-700'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-semibold">{bm.name}</div>
                      <div className="text-[10px] text-slate-500">{bm.category}</div>
                    </div>
                    {isSelected && <Check className="h-3.5 w-3.5 text-indigo-600" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <LayerControl />
      <MapLegend />

      <MapContainer 
        center={state.mapCenter} 
        zoom={state.mapZoom} 
        style={{ height: '100%', width: '100%', backgroundColor: '#0f172a' }} 
        ref={mapRef} 
        zoomControl={false}
        key={mapFullscreen ? 'fullscreen' : 'normal'}
      >
        <MapController />
        <MapHUDTracker onCursorMove={handleCursorMove} onZoomChange={handleZoomChange} />
        
        {/* Dynamic Multi-Source Basemap */}
        <TileLayer 
          key={activeBasemap.id}
          attribution={activeBasemap.attribution}
          url={activeBasemap.url}
          maxZoom={activeBasemap.maxZoom || 19}
        />

        {mapLayers.map((layer) => layer.visible ? <DynamicGeoJSONLayer key={layer.layerId} layer={layer} /> : null)}
      </MapContainer>

      {/* Coordinate & Zoom Head-Up Display (HUD) */}
      <div className="absolute bottom-2 left-4 z-[1000] pointer-events-none select-none">
        <div className="bg-slate-900/85 backdrop-blur-sm text-slate-200 text-[11px] font-mono px-3 py-1.5 rounded-lg shadow-md border border-slate-700/60 flex items-center gap-2.5">
          <span>
            Lat: {cursorPos.lat >= 0 ? `${cursorPos.lat.toFixed(4)}°N` : `${Math.abs(cursorPos.lat).toFixed(4)}°S`}
          </span>
          <span className="text-slate-600">|</span>
          <span>
            Lon: {cursorPos.lng >= 0 ? `${cursorPos.lng.toFixed(4)}°E` : `${Math.abs(cursorPos.lng).toFixed(4)}°W`}
          </span>
          <span className="text-slate-600">|</span>
          <span>Zoom: {currentZoom}</span>
          <span className="text-slate-600 hidden sm:inline">|</span>
          <span className="text-cyan-400 font-semibold hidden sm:inline">EPSG:4326</span>
        </div>
      </div>

      {isAgentLoading && (
        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-[1001]">
          <div className="bg-white rounded-2xl shadow-2xl p-5 px-7 flex items-center gap-4 border border-slate-200">
            <Loader className="h-5 w-5 animate-spin text-indigo-600" />
            <span className="text-slate-800 text-sm font-semibold">{agentStatusMessage || 'Executing geospatial computation...'}</span>
          </div>
        </div>
      )}

      {mapLayers.length === 0 && !isAgentLoading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[500]">
          <div className="text-center text-slate-500 bg-white/90 backdrop-blur-sm p-6 rounded-2xl shadow-xl border border-slate-200 max-w-sm mx-4">
            <Layers className="h-12 w-12 mx-auto mb-3 text-slate-400" />
            <p className="text-base font-bold text-slate-800">Map Canvas Ready</p>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Upload geospatial datasets, query external telemetry feeds, or run an analysis prompt to visualize interactive vector layers.
            </p>
          </div>
        </div>
      )}
      
      {/* Fullscreen Chat Widget */}
      {mapFullscreen && showFullscreenChat && (
        <div className={`absolute top-0 bg-white shadow-2xl z-[2000] flex flex-col border-l max-w-full h-full ${
          showFullscreenResults ? 'right-96 w-96' : 'right-0 w-96'
        }`}>
          <div className="p-3 bg-white border-b flex justify-between items-center flex-shrink-0">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Spatial Console</h3>
            <button
              onClick={() => setShowFullscreenChat(false)}
              className="p-1 rounded-lg hover:bg-slate-100 flex-shrink-0 text-slate-400 hover:text-slate-700 cursor-pointer"
              title="Close Console"
            >
              <X className="h-4 w-4" />
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
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Spatial Analysis Results</h3>
            <button
              onClick={() => setShowFullscreenResults(false)}
              className="p-1 rounded-lg hover:bg-slate-100 flex-shrink-0 text-slate-400 hover:text-slate-700 cursor-pointer"
              title="Close Results"
            >
              <X className="h-4 w-4" />
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

export default MapViewer;
