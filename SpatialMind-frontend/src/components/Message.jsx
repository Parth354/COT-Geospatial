import React from 'react';
import {
  Send, User, Bot,  Terminal, Eye,
  AlertCircle, Activity, 
  CheckCircle, Database
} from 'lucide-react';
import StructuredThought from './StructuredThought.jsx';
import CoTStep from './CoTStep.jsx';



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
          <div className="bg-white rounded-lg max-w-3xl shadow-md border space-y-2 w-full overflow-hidden">
            {msg.cot.status_update && ( <CoTStep title="Status" content={msg.cot.status_update.message} icon={Activity} color="border-gray-400 bg-gray-50" /> )}
            {msg.cot.chain_of_thought && ( <StructuredThought thought={msg.cot.chain_of_thought} /> )}
            {msg.cot.action && ( <CoTStep title="Action Taken" content={msg.cot.action.action} icon={Terminal} color="border-blue-400 bg-blue-50" isJson={true} /> )}
            {msg.cot.observation && ( <CoTStep title="Observation" content={msg.cot.observation.observation} icon={Eye} color="border-green-400 bg-green-50" /> )}
            {msg.cot.ingestion_complete && ( <CoTStep title="Ingestion Complete" content={msg.cot.ingestion_complete.message} icon={Database} color="border-cyan-400 bg-cyan-50" /> )}
            {msg.cot.ingestion_failed && ( <CoTStep title="Ingestion Failed" content={msg.cot.ingestion_failed.message} icon={AlertCircle} color="border-red-500 bg-red-50" /> )}
            {msg.cot.final_status && ( <CoTStep title="Job Finalized" content={msg.cot.final_status.message} icon={msg.cot.final_status.status === 'completed' ? CheckCircle : AlertCircle} color={msg.cot.final_status.status === 'completed' ? "border-green-500 bg-green-50" : "border-red-500 bg-red-50"} /> )}
          </div>
        </div>
      </div>
    );
  }
  return null;
});

export default Message;