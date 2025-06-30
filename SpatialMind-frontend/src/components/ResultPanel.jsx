import React, { useState } from 'react';
import { Download, Eye, BarChart3, Map, FileText, Code, AlertCircle, Trash2, Layers } from 'lucide-react';
import { useAppContext } from '../hooks/AppContext';
import SummaryTab from './SummaryTab';
import LayersTab from './LayerTab';
import HistoryTab from './HistoryTab';
import MetricsTab from './MetricsTab';
import { resultsAPI } from '../api/resultsAPI';



function ResultPanel() {
    const { state, actions } = useAppContext();
    const [activeTab, setActiveTab] = useState('summary');

    if (!state.results) {
        return (
            <div className="bg-white rounded-lg shadow-sm border p-6 flex-grow flex items-center justify-center">
                <div className="text-center text-gray-500">
                    <BarChart3 className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                    <p className="font-medium">No Analysis Results</p>
                    <p className="text-sm">Submit a query to see the agent's output here.</p>
                </div>
            </div>
        );
    }

    const { jobId, summary, layers = [], metrics = {}, full_history = [], processing_time_seconds } = state.results;

    const availableTabs = [
        { id: 'summary', label: 'Summary', icon: FileText },
        { id: 'layers', label: `Layers (${layers.length})`, icon: Map },
        { id: 'metrics', label: 'Metrics', icon: BarChart3, condition: Object.keys(metrics).length > 0 },
        { id: 'history', label: 'Agent History', icon: Code, condition: full_history.length > 0 },
    ].filter(tab => tab.condition !== false);

    const handleDownload = async (layer, jobId) => {
        try {
            const blob = await resultsAPI.downloadResult(jobId, `${layer.layer_name}.geojson`);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${layer.layer_name}.geojson`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } catch (err) {
            actions.addNotification({ type: 'error', message: `Download failed: ${err.message}` });
        }
    };

    const handleAddToMap = (layer) => {
        actions.addMapLayer({
            layerId: `${jobId}-${layer.layer_name}`,
            name: layer.layer_name,
            type: 'analysis_result',
            visible: true,
            dataUrl: layer.url,
            featureCount: layer.feature_count,
            bbox: layer.bbox,
            style: layer.style || { color: '#ff5722', fillOpacity: 0.6, weight: 2 },
            datasetId: jobId,
        });
    };

    return (
        <div className="bg-white rounded-lg shadow-sm border flex flex-col">
            <div className="border-b p-4 flex-shrink-0">
                <h3 className="text-lg font-semibold text-gray-900">Analysis Results</h3>
                <p className="text-xs text-gray-500 font-mono">Job ID: {jobId}</p>
            </div>

            <div className="border-b flex-shrink-0">
                <nav className="flex space-x-2 px-2">
                    {availableTabs.map(({ id, label, icon: Icon }) => (
                        <button
                            key={id}
                            onClick={() => setActiveTab(id)}
                            className={`flex items-center space-x-2 py-3 px-3 text-sm font-medium border-b-2 transition-all ${
                                activeTab === id
                                    ? 'text-blue-600 border-blue-500'
                                    : 'text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300'
                            }`}
                        >
                            <Icon className="h-4 w-4" />
                            <span>{label}</span>
                        </button>
                    ))}
                </nav>
            </div>

            <div className="p-4 overflow-y-auto">
                {activeTab === 'summary' && <SummaryTab summary={summary} processingTime={processing_time_seconds} onClear={actions.clearResults} />}
                {activeTab === 'layers' && <LayersTab layers={layers} jobId={jobId} onAddToMap={handleAddToMap} onDownload={handleDownload} />}
                {activeTab === 'metrics' && <MetricsTab metrics={metrics} />}
                {activeTab === 'history' && <HistoryTab history={full_history} />}
            </div>
        </div>
    );
}

export default ResultPanel;
