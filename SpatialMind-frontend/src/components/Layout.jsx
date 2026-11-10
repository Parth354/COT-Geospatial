import React from 'react';
import { Compass, Settings, Layers, Cloud } from 'lucide-react';
import { useAppContext } from '../hooks/AppContext';
import AgentStatus from './AgentStatus.jsx';
import SettingsModal from './SettingsModal.jsx';

function Layout({ children }) {
  const { state, actions } = useAppContext();
  const { mapLayers = [], uploadedDatasets = [], websocketConnected } = state;

  const handleSettingsClick = () => {
    actions.openSettings();
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-100/90 font-sans overflow-hidden">
      {/* Top Navigation Bar */}
      <header className="flex-shrink-0 bg-white border-b border-gray-200/90 px-4 sm:px-6 py-2.5 shadow-xs z-30">
        <div className="flex items-center justify-between">
          {/* Brand */}
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-slate-900 via-indigo-950 to-indigo-800 flex items-center justify-center text-white shadow-md shadow-indigo-950/20">
              <Compass className="h-5 w-5 text-cyan-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-gray-900 tracking-tight">SpatialMind</h1>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200 uppercase">
                  Spatial Engine Pro
                </span>
              </div>
              <p className="text-[11px] text-gray-500 hidden sm:block">
                Geospatial Intelligence & Spatial Computing Platform
              </p>
            </div>
          </div>

          {/* Quick Metrics & System Status */}
          <div className="flex items-center space-x-3">
            <div className="hidden md:flex items-center space-x-2 text-xs">
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-50 border border-gray-200 text-gray-700 font-medium" title="Active Map Layers">
                <Layers className="h-3.5 w-3.5 text-indigo-600" />
                <span>{mapLayers.length} Layer{mapLayers.length !== 1 ? 's' : ''}</span>
              </span>
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-50 border border-gray-200 text-gray-700 font-medium" title="Loaded Datasets">
                <Cloud className="h-3.5 w-3.5 text-blue-600" />
                <span>{uploadedDatasets.length} Dataset{uploadedDatasets.length !== 1 ? 's' : ''}</span>
              </span>
            </div>

            <AgentStatus />

            <button
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors"
              onClick={handleSettingsClick}
              title="System Information"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area (Full Height & Width, No Scroll Spillover) */}
      <main className="flex-grow w-full h-full min-h-0 overflow-hidden flex flex-col">
        {children}
      </main>

      {/* Footer */}
      <footer className="flex-shrink-0 bg-white border-t border-gray-200/80 px-4 sm:px-6 py-1.5 z-20">
        <div className="flex items-center justify-between text-[11px] text-gray-500">
          <div className="flex items-center space-x-4">
            <span className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${websocketConnected ? 'bg-emerald-500 shadow-xs' : 'bg-amber-500 animate-ping'}`} />
              <span className="font-medium text-gray-700">{websocketConnected ? 'WebSocket Live' : 'Reconnecting...'}</span>
            </span>
            <span className="text-gray-300">|</span>
            <span className="hidden sm:inline text-gray-500">PostGIS · GDAL · Leaflet · GeoProcessing Engine</span>
          </div>
          <div>© {new Date().getFullYear()} SpatialMind Analytics Platform</div>
        </div>
      </footer>

      {/* Global API Settings & Security Modal */}
      <SettingsModal
        isOpen={Boolean(state.isSettingsOpen)}
        onClose={actions.closeSettings}
        onKeySaved={(prov) => {
          actions.addNotification({
            type: 'success',
            title: 'Credentials Saved',
            message: `${prov.toUpperCase()} API key securely configured and verified.`
          });
        }}
      />
    </div>
  );
}

export default Layout;
