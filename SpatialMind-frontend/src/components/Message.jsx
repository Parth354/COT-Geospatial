import React from 'react';
import {
  Send, User, Bot,  Terminal, Eye,
  AlertCircle, Activity, 
  CheckCircle, Database
} from 'lucide-react';
import StructuredThought from './StructuredThought.jsx';
import CoTStep from './CoTStep.jsx';

// Helper function to format final message with markdown-like sections
const formatFinalMessage = (message) => {
  if (!message) return '';
  
  // Split by markdown headers (##)
  const parts = message.split(/(## .+)/);
  const elements = [];
  
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();
    if (!part) continue;
    
    if (part.startsWith('## ')) {
      // Header
      const headerText = part.replace('## ', '');
      elements.push(
        <div key={i} className="mt-3 mb-2">
          <h5 className="font-bold text-gray-800 text-sm">{headerText}</h5>
        </div>
      );
    } else {
      // Regular text - split by lines and format lists
      const lines = part.split('\n');
      lines.forEach((line, lineIdx) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        
        if (trimmed.match(/^\d+\./)) {
          // Numbered list item
          elements.push(
            <div key={`${i}-${lineIdx}`} className="ml-4 mb-1 text-gray-700">
              {trimmed}
            </div>
          );
        } else if (trimmed.startsWith('- ')) {
          // Bullet point
          elements.push(
            <div key={`${i}-${lineIdx}`} className="ml-4 mb-1 text-gray-700">
              {trimmed}
            </div>
          );
        } else {
          // Regular paragraph
          elements.push(
            <div key={`${i}-${lineIdx}`} className="mb-2 text-gray-700">
              {trimmed}
            </div>
          );
        }
      });
    }
  }
  
  return elements.length > 0 ? <div>{elements}</div> : <div>{message}</div>;
};



const Message = React.memo(({ msg }) => {
  if (msg.type === 'user') {
    return (
      <div className="flex justify-end mb-4">
        <div className="flex items-start gap-2 flex-row-reverse">
          <User className="h-6 w-6 text-blue-500 rounded-full bg-blue-100 p-1 mt-1 flex-shrink-0" />
          <div className="bg-blue-600 text-white rounded-lg p-3 max-w-lg shadow">{msg.content}</div>
        </div>
      </div>
    );
  }

  if (msg.type === 'assistant' && msg.cot) {
    return (
      <div className="flex justify-start mb-4">
        <div className="flex items-start gap-2">
          <Bot className="h-6 w-6 text-indigo-500 rounded-full bg-indigo-100 p-1 mt-1 flex-shrink-0" />
          <div className="bg-white rounded-lg max-w-md shadow-md border space-y-2 w-full overflow-hidden min-w-0 flex flex-col">
            {msg.cot.status_update && ( <CoTStep title="Status" content={msg.cot.status_update.message} icon={Activity} color="border-gray-400 bg-gray-50" /> )}
            {msg.cot.chain_of_thought && ( <StructuredThought thought={msg.cot.chain_of_thought} /> )}
            {msg.cot.action && ( <CoTStep title="Action Taken" content={msg.cot.action.action} icon={Terminal} color="border-blue-400 bg-blue-50" isJson={true} /> )}
            {msg.cot.observation && ( <CoTStep title="Observation" content={msg.cot.observation.observation} icon={Eye} color="border-green-400 bg-green-50" /> )}
            {msg.cot.ingestion_complete && ( <CoTStep title="Ingestion Complete" content={msg.cot.ingestion_complete.message} icon={Database} color="border-cyan-400 bg-cyan-50" /> )}
            {msg.cot.ingestion_failed && ( <CoTStep title="Ingestion Failed" content={msg.cot.ingestion_failed.message} icon={AlertCircle} color="border-red-500 bg-red-50" /> )}
            {msg.cot.final_status && (
              <div className={`border-l-4 ${msg.cot.final_status.status === 'completed' ? "border-green-500 bg-green-50" : "border-red-500 bg-red-50"} p-4 rounded-r max-w-md w-full`}>
                <div className="flex items-center gap-2 mb-3">
                  {msg.cot.final_status.status === 'completed' ? <CheckCircle className="h-5 w-5 text-green-600" /> : <AlertCircle className="h-5 w-5 text-red-600" />}
                  <h4 className="font-semibold text-gray-800">Job Finalized</h4>
                </div>
                <div className="text-sm text-gray-700 whitespace-pre-wrap break-words">
                  {formatFinalMessage(msg.cot.final_status.message)}
                </div>
                {msg.cot.final_status.analysis_summary && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <h5 className="font-semibold text-xs text-gray-600 mb-2">Analysis Summary</h5>
                    <div className="text-xs text-gray-600 space-y-1">
                      {msg.cot.final_status.analysis_summary.datasets_used?.length > 0 && (
                        <div><strong>Datasets used:</strong> {msg.cot.final_status.analysis_summary.datasets_used.join(', ')}</div>
                      )}
                      {msg.cot.final_status.analysis_summary.tools_executed?.length > 0 && (
                        <div><strong>Tools executed:</strong> {msg.cot.final_status.analysis_summary.tools_executed.join(', ')}</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
  return null;
});

export default Message;