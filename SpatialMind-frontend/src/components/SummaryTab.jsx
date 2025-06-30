import React from 'react';

const SummaryTab = React.memo(({ summary, processingTime, onClear }) => (
    <div className="space-y-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-semibold text-blue-900 mb-2">Agent's Summary</h4>
            <p className="text-blue-800 text-sm leading-relaxed">{summary || 'The analysis has finished without a detailed summary.'}</p>
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
