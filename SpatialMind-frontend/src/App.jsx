import React, { useEffect } from 'react'
import { AppProvider } from './hooks/useAppContext'
import ChatWindow from './components/ChatWindow'
import Layout from './components/Layout'
import MapViewer from './components/MapViewer'
import ResultPanel from './components/ResultPanel'
import NotificationSystem from './components/NotificationSystem'
import DataUpload from './components/DataUpload'
import webSocketService from './services/websocket'

function App() {
  useEffect(() => {
    webSocketService.connect().catch(console.error)
    return () => webSocketService.disconnect()
  }, [])

  return (
    <AppProvider>
      {/* Render notifications OUTSIDE Layout so they're not clipped or overlapped */}
      <NotificationSystem />

      <Layout>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 h-full gap-4 p-4">
          <div className="col-span-1 h-full flex flex-col space-y-4">
            <DataUpload />
            <ResultPanel />
          </div>

          <div className="col-span-1 lg:col-span-2 h-full flex flex-col space-y-4">
            <MapViewer />
            <ChatWindow />
          </div>
        </div>
      </Layout>
    </AppProvider>
  )
}

export default App
