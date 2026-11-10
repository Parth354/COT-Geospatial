import React from 'react';
import { BarChart3, AlertCircle, ShieldAlert, ArrowUpRight } from 'lucide-react';

const MetricsTab = React.memo(({ metrics }) => {
  const audit = metrics?.data_completeness_audit;
  const metricEntries = Object.entries(metrics || {}).filter(
    ([key, value]) => key !== 'layers' && key !== 'data_completeness_audit' && typeof value !== 'object'
  );

  if (metricEntries.length === 0 && !audit) {
    return (
      <div className="text-center text-gray-400 py-8">
        <BarChart3 className="h-10 w-10 mx-auto mb-3" />
        <p className="text-sm font-medium">No Metrics Available</p>
        <p className="text-xs">The analysis did not compute any quantitative metrics.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Primary Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {metricEntries.map(([key, value]) => (
          <div key={key} className="bg-slate-50 border border-slate-200/80 p-3.5 rounded-lg shadow-2xs">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{key.replace(/_/g, ' ')}</p>
            <p className="text-xl font-bold text-slate-900 mt-1">
              {typeof value === 'number' ? value.toLocaleString() : String(value)}
            </p>
          </div>
        ))}
      </div>

      {/* Data Quality & Completeness Audit Section */}
      {audit && (
        <div className="p-4 bg-amber-50/50 border border-amber-200/80 rounded-lg space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-700" />
              <h5 className="text-xs font-bold text-amber-950 uppercase tracking-wider">Data Quality & Completeness Audit</h5>
            </div>
            <span className="text-xs font-mono font-bold text-amber-900 bg-amber-100/80 px-2 py-0.5 rounded border border-amber-300/60">
              {audit.coverage_completeness_pct}% Completeness
            </span>
          </div>

          <div className="text-xs text-amber-900/90 leading-relaxed">
            <p><strong>Uncertainty Tier:</strong> {audit.uncertainty_rating}</p>
            <p><strong>Spatial Resolution:</strong> {audit.spatial_resolution}</p>
            <p><strong>Temporal Cadence:</strong> {audit.temporal_cadence}</p>
          </div>

          {audit.missing_variables && audit.missing_variables.length > 0 && (
            <div>
              <p className="text-[11px] font-bold text-amber-900 mb-1.5 uppercase">Missing Primary Variables:</p>
              <div className="flex flex-wrap gap-1.5">
                {audit.missing_variables.map((v, i) => (
                  <span key={i} className="text-[11px] bg-white border border-amber-300 text-amber-800 px-2 py-0.5 rounded-md shadow-2xs font-medium">
                    {v}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default MetricsTab;
