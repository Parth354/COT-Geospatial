import React from 'react';
import { Trash2, Clock, CheckCircle2, ShieldAlert, AlertTriangle, ArrowRight, Database, Printer, FileDown } from 'lucide-react';
import MarkdownRenderer from './ui/MarkdownRenderer.jsx';

const SummaryTab = React.memo(({ summary, processingTime, onClear, audit }) => {
  const handleExportPDF = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to export the PDF report.');
      return;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>SpatialMind - Geospatial Intelligence Report</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; color: #1e293b; padding: 40px; max-width: 900px; margin: auto; }
            h1 { color: #0f172a; border-bottom: 2px solid #3b82f6; padding-bottom: 10px; font-size: 24px; }
            h2 { color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; font-size: 18px; margin-top: 24px; }
            h3 { color: #334155; font-size: 15px; }
            .badge { display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; background: #e0e7ff; color: #3730a3; margin-right: 6px; }
            .audit-box { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px; margin: 20px 0; }
            .audit-title { font-weight: 700; color: #0f172a; font-size: 14px; margin-bottom: 8px; }
            .roadmap-item { background: #ffffff; border-left: 3px solid #3b82f6; padding: 8px 12px; margin: 8px 0; font-size: 13px; }
            @media print {
              body { padding: 20px; }
              button { display: none; }
            }
          </style>
        </head>
        <body>
          <h1>SpatialMind Geospatial Intelligence Report</h1>
          <p style="color: #64748b; font-size: 12px;">Generated on: ${new Date().toUTCString()} | Processing Time: ${processingTime ? Number(processingTime).toFixed(2) : '0.8'}s</p>
          
          <div style="margin: 20px 0; font-size: 13px; white-space: pre-wrap;">${summary || 'No executive summary text available.'}</div>

          ${audit ? `
          <div class="audit-box">
            <div class="audit-title">Data Completeness & Uncertainty Audit</div>
            <p><strong>Coverage Completeness:</strong> ${audit.coverage_completeness_pct}% (${audit.uncertainty_rating})</p>
            <p><strong>Domain:</strong> ${audit.domain || 'Geospatial Intelligence'}</p>
            <p><strong>Spatial Resolution:</strong> ${audit.spatial_resolution || 'Discrete monitoring stations'}</p>
            <p><strong>Temporal Cadence:</strong> ${audit.temporal_cadence || 'Real-time telemetry'}</p>
            
            ${audit.missing_variables ? `
              <p><strong>Missing Primary Variables:</strong></p>
              <div>${audit.missing_variables.map(v => `<span class="badge" style="background:#fee2e2;color:#991b1b;">${v}</span>`).join(' ')}</div>
            ` : ''}

            ${audit.data_improvement_roadmap ? `
              <h3 style="margin-top:16px;">Actionable Data Improvement Roadmap</h3>
              ${audit.data_improvement_roadmap.map((step, i) => `<div class="roadmap-item"><strong>${i+1}.</strong> ${step}</div>`).join('')}
            ` : ''}
          </div>
          ` : ''}

          <div style="margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 10px; font-size: 11px; color: #94a3b8; text-align: center;">
            SpatialMind Enterprise Geospatial Analytics Platform &bull; Automated Remote Sensing &amp; Terrain Processing Engine
          </div>

          <script>
            window.onload = function() { window.print(); };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  return (
    <div className="space-y-4">
      {/* Metrics / Status Header */}
      <div className="flex items-center justify-between p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-100">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-600 text-white shadow-sm">
            <CheckCircle2 className="h-4 w-4" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-gray-900">Executive Analysis Summary</h4>
            <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
              <Clock className="h-3 w-3" />
              <span>Processed in <strong>{processingTime ? Number(processingTime).toFixed(2) : '0.8'}s</strong></span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Export PDF Report Button */}
          <button
            onClick={handleExportPDF}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-indigo-700 bg-white hover:bg-indigo-50 rounded-md border border-indigo-200 transition-all shadow-xs"
            title="Export / Print Executive Intelligence PDF Report"
          >
            <Printer className="h-3.5 w-3.5 text-indigo-600" />
            <span>Export PDF</span>
          </button>

          {onClear && (
            <button
              onClick={onClear}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-gray-500 hover:text-red-600 hover:bg-white rounded-md border border-gray-200 transition-all shadow-xs"
              title="Clear Results"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Formatted Analysis Content */}
      <div className="p-4 bg-white rounded-lg border border-gray-200 shadow-xs">
        <MarkdownRenderer content={summary} />
      </div>

      {/* Structured Data Completeness & Limitation Audit Card */}
      {audit && (
        <div className="p-4 bg-slate-50 border border-slate-200/90 rounded-lg space-y-3.5 shadow-2xs">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-600" />
              <h5 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Data Completeness & Uncertainty Audit</h5>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium text-gray-500">Coverage Completeness:</span>
              <span className="text-xs font-mono font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                {audit.coverage_completeness_pct}%
              </span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
            <div 
              className={`h-1.5 rounded-full ${audit.coverage_completeness_pct >= 70 ? 'bg-emerald-500' : audit.coverage_completeness_pct >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
              style={{ width: `${audit.coverage_completeness_pct}%` }}
            />
          </div>

          {/* Domain & Cadence Metadata */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-gray-700 bg-white p-2.5 rounded border border-gray-200">
            <div><strong>Uncertainty Tier:</strong> <span className="text-gray-600">{audit.uncertainty_rating}</span></div>
            <div><strong>Domain:</strong> <span className="text-gray-600">{audit.domain}</span></div>
            <div><strong>Spatial Sampling:</strong> <span className="text-gray-600">{audit.spatial_resolution}</span></div>
            <div><strong>Temporal Cadence:</strong> <span className="text-gray-600">{audit.temporal_cadence}</span></div>
          </div>

          {/* Identified Incomplete Aspects */}
          {audit.identified_incomplete_aspects && audit.identified_incomplete_aspects.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-gray-800 mb-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                <span>Identified Incomplete Aspects & Sensor Gaps:</span>
              </div>
              <ul className="space-y-1.5 text-xs text-gray-600 pl-4 list-disc">
                {audit.identified_incomplete_aspects.map((aspect, idx) => (
                  <li key={idx} className="leading-relaxed">{aspect}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Missing Primary Variables */}
          {audit.missing_variables && audit.missing_variables.length > 0 && (
            <div>
              <div className="text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                Missing Primary Atmospheric / Spatial Variables:
              </div>
              <div className="flex flex-wrap gap-1.5">
                {audit.missing_variables.map((v, i) => (
                  <span key={i} className="text-[11px] bg-red-50 text-red-700 border border-red-200 font-medium px-2 py-0.5 rounded shadow-2xs">
                    {v}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Actionable Data Improvement Roadmap */}
          {audit.data_improvement_roadmap && audit.data_improvement_roadmap.length > 0 && (
            <div className="border-t border-slate-200 pt-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-gray-900 mb-2">
                <Database className="h-3.5 w-3.5 text-indigo-600" />
                <span>Actionable Data Improvement Roadmap:</span>
              </div>
              <div className="space-y-1.5">
                {audit.data_improvement_roadmap.map((step, idx) => (
                  <div key={idx} className="flex items-start gap-2 p-2 bg-indigo-50/50 rounded border border-indigo-100 text-xs text-gray-800">
                    <span className="font-bold text-indigo-700 flex-shrink-0">{idx + 1}.</span>
                    <span className="leading-relaxed">{step}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default SummaryTab;
