import React from 'react';
import { Loader } from 'lucide-react';
import { useAppContext } from '../hooks/AppContext';


const AgentStatus = React.memo(() => {
    const { state } = useAppContext();
    const { isAgentLoading, uploadedDatasets, activeJobId } = state;
    
    // ✅ NEW: Check if any dataset is currently in the 'ingesting' state.
    const isIngesting = uploadedDatasets.some(d => d.status === 'ingesting');
    const isLoading = isAgentLoading || isIngesting;

    // Determine the status message based on a priority order.
    let statusMessage = '';
    if (isAgentLoading) {
        statusMessage = "Agent is processing...";
    } else if (isIngesting) {
        statusMessage = "Ingesting dataset...";
    }
    
    // Don't render anything if the system is fully idle.
    if (!isLoading) return null;

    return (
      <div className="flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold transition-all duration-300 bg-blue-50 text-blue-800">
        <Loader className="h-4 w-4 animate-spin" />
        <div>
            <span>{statusMessage}</span>
            {isAgentLoading && activeJobId && (
                <span className="ml-2 opacity-60 font-mono">{activeJobId.substring(0,8)}</span>
            )}
        </div>
      </div>
    );
});
export default AgentStatus;
