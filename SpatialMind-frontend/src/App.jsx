import React, { useEffect } from 'react';
import { Cloud, MessageSquare, BarChart3, Layers } from 'lucide-react';
import { AppProvider, useAppContext } from './hooks/AppContext';
import ErrorBoundary from './components/ErrorBoundary';
import webSocketService from './socket/websocket.js';
import Layout from './components/Layout';
import { ResizablePanelHorizontal } from './components/ui/ResizablePanelHorizontal';
import { ResizablePanelVertical } from './components/ui/ResizablePanelVertical';
import { TabbedPanel } from './components/ui/TabbedPanel';
import MapViewer from './components/MapViewer';
import ChatWindow from './components/ChatWindow';
import DataUpload from './components/DataUpload';
import ResultPanel from './components/ResultPanel';
import NotificationSystem from './components/NotificationSystem';

const WebSocketManager = () => {
  const { dispatch } = useAppContext();

  useEffect(() => {
    console.log("WebSocketManager: Registering central dispatcher with WebSocket service.");
    webSocketService.registerDispatcher(dispatch);
    
    const checkConnection = setTimeout(() => {
      const isConnected = webSocketService.getConnectionStatus();
      console.log(`[WebSocketManager] Initial connection check: ${isConnected}`);
      dispatch({ type: 'SET_WEBSOCKET_CONNECTED', payload: isConnected });
    }, 500);

    return () => {
      clearTimeout(checkConnection);
      console.log("WebSocketManager: Unregistering dispatcher.");
      webSocketService.unregisterDispatcher();
    };
  }, [dispatch]);

  return null;
};

function App() {
  const { state } = useAppContext();
  const datasetCount = state?.uploadedDatasets?.length ?? 0;

  // Left sidebar tabs: AI Chat Analyst (Primary) and Data Catalog
  const sidebarTabs = [
    {
      id: 'chat',
      label: 'AI Analyst',
      icon: MessageSquare,
      component: ChatWindow,
      noPadding: true,
    },
    {
      id: 'data',
      label: 'Data Catalog',
      icon: Cloud,
      component: DataUpload,
      noPadding: false,
      badge: datasetCount > 0 ? datasetCount : undefined,
    },
  ];

  // Left Panel Content: Dedicated Chat Assistant and Data Catalog
  const LeftPanelContent = (
    <div className="h-full p-2.5 pl-3 pr-1 relative z-20">
      <TabbedPanel tabs={sidebarTabs} defaultTabId="chat" />
    </div>
  );

  // Right Panel Content: Map on Top, Results Panel directly below the Map
  const RightPanelContent = (
    <div className="h-full p-2.5 pr-3 pl-1 relative z-10">
      <ResizablePanelVertical
        topPanel={<MapViewer />}
        bottomPanel={<ResultPanel />}
        defaultHeight={58}
      />
    </div>
  );

  return (
    <Layout>
      <ResizablePanelHorizontal
        leftPanel={LeftPanelContent}
        rightPanel={RightPanelContent}
        defaultWidth={34}
      />
    </Layout>
  );
}

function RootApp() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <WebSocketManager />
        <NotificationSystem />
        <App />
      </AppProvider>
    </ErrorBoundary>
  );
}

export default RootApp;
