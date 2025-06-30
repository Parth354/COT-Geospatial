import React, { useEffect } from 'react';
import { Cloud, BarChart3 } from 'lucide-react';
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

    return () => {
      console.log("WebSocketManager: Unregistering dispatcher.");
      webSocketService.unregisterDispatcher();
    };
  }, [dispatch]);

  return null;
};


function App() {
  const sidebarTabs = [
    { id: 'data', label: 'Data', icon: Cloud, component: DataUpload },
    { id: 'results', label: 'Results', icon: BarChart3, component: ResultPanel },
  ];

  const LeftPanelContent = (
    <div className="h-full p-4 pl-4 pr-2 relative z-20">
      <TabbedPanel tabs={sidebarTabs} />
    </div>
  );

  const RightPanelContent = (
    <div className="h-full p-4 pr-4 pl-2 relative z-10">
      <ResizablePanelVertical
        topPanel={<MapViewer />}
        bottomPanel={<ChatWindow />}
        defaultHeight={65}
      />
    </div>
  );

  return (
    <ErrorBoundary>
      <AppProvider>
        <WebSocketManager />
        <NotificationSystem />
        <Layout>
          <ResizablePanelHorizontal
            leftPanel={LeftPanelContent}
            rightPanel={RightPanelContent}
            defaultWidth={25}
          />
        </Layout>
      </AppProvider>
    </ErrorBoundary>
  );
}

export default App;