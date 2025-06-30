import React from 'react';
import { Wifi, WifiOff } from 'lucide-react';
import { useAppContext } from '../hooks/AppContext';


const ConnectionStatus = React.memo(() => {
    const { state } = useAppContext();
    const { websocketConnected } = state;
    
    return (
        <div
        className="flex items-center gap-2 text-xs font-medium"
        title={websocketConnected ? 'Live connection to server' : 'Disconnected, attempting to reconnect...'}
        >
            {websocketConnected ? (
                <Wifi className="h-4 w-4 text-green-500" />
            ) : (
                <WifiOff className="h-4 w-4 text-red-500 animate-pulse" />
            )}
        </div>
    );
});
export default ConnectionStatus;