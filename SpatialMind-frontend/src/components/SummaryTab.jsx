import React from 'react';
import { Trash2 } from 'lucide-react';

// Helper function to format final message with markdown-like sections (same as Message.jsx)
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

const SummaryTab = React.memo(({ summary, processingTime, onClear }) => (
    <div className="space-y-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-semibold text-blue-900 mb-2">Agent's Summary</h4>
            <div className="text-blue-800 text-sm leading-relaxed">
                {summary ? formatFinalMessage(summary) : 'The analysis has finished without a detailed summary.'}
            </div>
            {processingTime && (
                <p className="text-xs text-blue-700 mt-3 pt-2 border-t border-blue-200">Processing Time: {processingTime}s</p>
            )}
        </div>
        <button onClick={onClear} className="text-xs text-gray-500 hover:text-red-600 flex items-center gap-1.5 transition-colors">
            <Trash2 className="h-3 w-3" />
            Clear Results
        </button>
    </div>
));

export default SummaryTab;
