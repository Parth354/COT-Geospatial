import React, { useState } from 'react';
import {
  Download, Eye, BarChart3, Map, FileText, Code, Layers, Sparkles, CheckCircle2
} from 'lucide-react';
import { useAppContext } from '../hooks/AppContext';
import SummaryTab from './SummaryTab';
import LayersTab from './LayerTab';
import HistoryTab from './HistoryTab';
import MetricsTab from './MetricsTab';
import { resultsAPI } from '../api/resultsAPI';
import { getDefaultLayerStyle } from '../utils/hazardStyling';

function ResultPanel() {
  const { state, actions } = useAppContext();
  const [activeTab, setActiveTab] = useState('summary');

  if (!state.results) {
    return (
      <div className="h-full bg-white rounded-lg shadow-xs border border-gray-200/90 p-6 flex flex-col items-center justify-center text-center">
        <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-center text-slate-400 mb-3 shadow-xs">
          <BarChart3 className="h-6 w-6" />
        </div>
        <h4 className="text-sm font-bold text-gray-800 mb-1">Spatial Analysis Results</h4>
        <p className="text-xs text-gray-500 max-w-sm leading-relaxed">
          Ask a question in the AI Analyst panel on the left to see computed spatial layers, metrics, and reports here.
        </p>
      </div>
    );
  }

  const {
    jobId,
    summary,
    layers = [],
    metrics = {},
    full_history = [],
    processing_time_seconds,
  } = state.results;

  const availableTabs = [
    { id: 'summary', label: 'Summary', icon: FileText },
    { id: 'layers', label: `Layers (${layers.length})`, icon: Map },
    { id: 'metrics', label: 'Metrics', icon: BarChart3, condition: Object.keys(metrics).length > 0 },
    { id: 'history', label: 'Reasoning Trace', icon: Code, condition: full_history && full_history.length > 0 },
  ].filter((tab) => tab.condition !== false);

  const handleDownload = async (layer, jId) => {
    try {
      const blob = await resultsAPI.downloadResult(jId, `${layer.layer_name}.geojson`);
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
    const layerStyle = (layer.style && layer.style.color !== '#ff5722') 
      ? layer.style 
      : getDefaultLayerStyle(layer.layer_name);

    actions.addMapLayer({
      layerId: `${jobId}-${layer.layer_name}`,
      name: layer.layer_name,
      type: 'analysis_result',
      visible: true,
      dataUrl: layer.url,
      featureCount: layer.feature_count,
      bbox: layer.bbox,
      style: layerStyle,
      datasetId: jobId,
    });
  };

  return (
    <div className="h-full bg-white rounded-lg shadow-xs border border-gray-200/90 flex flex-col overflow-hidden min-w-0">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between flex-shrink-0 bg-slate-50/70">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-md bg-indigo-600 text-white shadow-xs">
            <BarChart3 className="h-3.5 w-3.5" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-gray-900 leading-tight">Spatial Analysis Results</h3>
            <span className="text-[10px] text-gray-400 font-mono">Job: {jobId ? jobId.slice(0, 13) : 'active'}...</span>
          </div>
        </div>

        {layers.length > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="h-3 w-3" />
            {layers.length} Layer{layers.length > 1 ? 's' : ''} Ready
          </span>
        )}
      </div>

      {/* Tabs bar */}
      <div className="border-b border-gray-100 flex-shrink-0 bg-white">
        <nav className="flex space-x-1 px-3 pt-1">
          {availableTabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center space-x-1.5 py-2 px-3 text-xs font-semibold border-b-2 transition-all ${
                activeTab === id
                  ? 'text-indigo-600 border-indigo-600'
                  : 'text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-200'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Panels */}
      <div className="p-4 overflow-y-auto flex-1 bg-white">
        {activeTab === 'summary' && (
          <SummaryTab
            summary={summary}
            processingTime={processing_time_seconds}
            onClear={actions.clearResults}
            audit={state.results?.analysis_summary?.data_completeness_audit || state.results?.data_completeness_audit || metrics?.data_completeness_audit}
          />
        )}
        {activeTab === 'layers' && (
          <LayersTab
            layers={layers}
            jobId={jobId}
            onAddToMap={handleAddToMap}
            onDownload={handleDownload}
          />
        )}
        {activeTab === 'metrics' && <MetricsTab metrics={metrics} />}
        {activeTab === 'history' && <HistoryTab history={full_history} />}
      </div>
    </div>
  );
}

export default ResultPanel;
