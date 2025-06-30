import React from 'react';
import { Map, Eye, Download } from 'lucide-react';


const LayersTab = React.memo(({ layers, jobId, onAddToMap, onDownload }) => {
    if (!layers || layers.length === 0) {
        return (
            <div className="text-center text-gray-400 py-8">
                <Map className="h-10 w-10 mx-auto mb-3" />
                <p className="text-sm font-medium">No Output Layers</p>
                <p className="text-xs">The agent did not produce any geospatial layers for this analysis.</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {layers.map((layer, idx) => (
                <div key={idx} className="border rounded-md p-3 flex items-center justify-between hover:bg-gray-50 transition-colors">
                    <div className="min-w-0">
                        <p className="font-medium text-gray-800 truncate" title={layer.layer_name}>{layer.layer_name}</p>
                        <p className="text-xs text-gray-500">{layer.feature_count.toLocaleString()} features</p>
                    </div>
                    <div className="flex items-center space-x-3 flex-shrink-0">
                        <button onClick={() => onAddToMap(layer)} className="text-sm font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1.5">
                            <Eye className="h-4 w-4" /> View
                        </button>
                        <button onClick={() => onDownload(layer, jobId)} className="text-sm font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1.5">
                            <Download className="h-4 w-4" /> Download
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
});

export default LayersTab;