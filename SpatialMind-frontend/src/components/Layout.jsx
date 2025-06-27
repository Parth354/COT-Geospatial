import React from 'react'
import { Map, Settings, Wifi, WifiOff } from 'lucide-react'
import { useAppContext } from '../hooks/useAppContext'

function Layout({ children }) {
  const { state, actions } = useAppContext()

  const handleSettingsClick = () => {
    actions.addNotification({
      type: 'info',
      title: 'Coming Soon',
      message: 'Settings feature is under development.',
      timeout: 4000
    })
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Map className="h-8 w-8 text-primary-600" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">SpatialMind</h1>
              <p className="text-sm text-gray-500">Geospatial AI Workflow System</p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {/* WebSocket Connection Status */}
            <div className="flex items-center space-x-2">
              {state.websocketConnected ? (
                <div className="flex items-center space-x-1 text-green-600">
                  <Wifi className="h-4 w-4" />
                  <span className="text-xs hidden sm:inline">Connected</span>
                </div>
              ) : (
                <div className="flex items-center space-x-1 text-red-600">
                  <WifiOff className="h-4 w-4" />
                  <span className="text-xs hidden sm:inline">Disconnected</span>
                </div>
              )}
            </div>

            {/* Processing Status */}
            {state.loading && (
              <div className="flex items-center space-x-2 text-primary-600">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600"></div>
                <span className="text-sm">Processing...</span>
              </div>
            )}

            {/* Current Job Status */}
            {state.currentJobId && (
              <div className="flex flex-col items-end">
                <div className="text-xs text-gray-500">
                  Job: {state.currentJobId.slice(0, 8)}...
                </div>
                {state.processingStatus && (
                  <div className="text-xs capitalize text-primary-600">
                    {state.processingStatus}
                  </div>
                )}
              </div>
            )}

            {/* Session ID (for debugging) */}
            {state.sessionId && (
              <div className="text-xs text-gray-400 hidden lg:block">
                Session: {state.sessionId.slice(0, 8)}...
              </div>
            )}

            <button
              className="btn btn-secondary flex items-center space-x-1"
              onClick={handleSettingsClick}
            >
              <Settings className="h-4 w-4" />
              <span className="text-sm hidden sm:inline">Settings</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main scrollable content */}
      <main className="flex-grow">{children}</main>

      {/* Footer - Updated to use new state structure */}
      <footer className="bg-white border-t border-gray-200 px-6 py-2">
        <div className="flex items-center justify-between text-sm text-gray-500">
          <div className="flex items-center space-x-4">
            <span>Layers: {state.mapLayers.length}</span>
            <span>Datasets: {state.uploadedDatasets.length}</span>
            <span>Messages: {state.messages.length}</span>
            {state.cotSteps.length > 0 && (
              <span>CoT Steps: {state.cotSteps.length}</span>
            )}
          </div>
          <div className="flex items-center space-x-4">
            {state.results && (
              <span className="text-green-600">
                Results Available ({state.results.mapLayers?.length || 0} layers)
              </span>
            )}
            {state.error && (
              <span className="text-danger-600">Error: {state.error}</span>
            )}
          </div>
        </div>
      </footer>
    </div>
  )
}

export default Layout
