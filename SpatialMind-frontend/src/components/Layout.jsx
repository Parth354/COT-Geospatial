import React from 'react';
import { BrainCircuit, Settings, Layers, Cloud } from 'lucide-react';
import { useAppContext } from '../hooks/AppContext';
import AgentStatus from './AgentStatus.jsx';



function Layout({ children }) {
  const { state, actions } = useAppContext();
  const { mapLayers, uploadedDatasets } = state;

  const handleSettingsClick = () => {
    actions.addNotification({ type: 'info', title: 'Settings Panel', message: 'This feature is under development.' });
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-gray-100 font-sans overflow-hidden">
      
      {/* --- Header --- */}
      <header className="flex-shrink-0 bg-white border-b px-4 sm:px-6 py-3 shadow-sm z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <BrainCircuit className="h-8 w-8 text-indigo-600" />
            <div>
              <h1 className="text-xl font-bold text-gray-800">SpatialMind</h1>
              <p className="text-sm text-gray-500 hidden md:block">Autonomous Geospatial AI System</p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <AgentStatus />
            <button
              className="p-2 rounded-full hover:bg-gray-100 text-gray-600"
              onClick={handleSettingsClick}
              title="Settings"
            ><Settings className="h-5 w-5" /></button>
          </div>
        </div>
      </header>

      {/* --- Main Content Area --- */}
      <main className="flex-grow w-full max-w-screen-2xl mx-auto overflow-y-auto">
        {children}
      </main>

      {/* --- Footer (This component's logic was already correct) --- */}
      <footer className="flex-shrink-0 bg-white border-t px-4 sm:px-6 py-2 z-10">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center space-x-6">
            <div className="flex items-center gap-2" title={`${mapLayers.length} active layers on map`}>
                <Layers className="h-4 w-4 text-blue-500" />
                <span className="font-medium">{mapLayers.length}</span>
            </div>
             <div className="flex items-center gap-2" title={`${uploadedDatasets.length} available datasets`}>
                <Cloud className="h-4 w-4 text-gray-600" />
                <span className="font-medium">{uploadedDatasets.length}</span>
            </div>
          </div>
          <div>© {new Date().getFullYear()} SpatialMind</div>
        </div>
      </footer>
    </div>
  );
}

export default Layout;