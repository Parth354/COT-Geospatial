import React, { useState } from 'react';
import { Terminal, Copy, Check, ChevronDown, ChevronRight, Eye, Layers } from 'lucide-react';

export const CoTStep = React.memo(({ title, content, icon: Icon, color, isJson = false }) => {
  const [copied, setCopied] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);

  const handleCopy = () => {
    const text = isJson && typeof content === 'object' ? JSON.stringify(content, null, 2) : String(content);
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // If this is an Action invocation object
  const isActionObj = isJson && content && typeof content === 'object' && ('tool' in content || 'args' in content);
  const toolName = isActionObj ? content.tool : null;
  const toolArgs = isActionObj && content.args && typeof content.args === 'object' ? content.args : null;

  return (
    <div className="rounded-lg border border-slate-200/90 bg-white p-3 shadow-xs text-xs space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
        <div className="flex items-center gap-1.5 font-semibold text-[11px] tracking-wide uppercase text-slate-700">
          {Icon && <Icon className="h-3.5 w-3.5 text-slate-500" />}
          <span>{title}</span>
          {toolName && (
            <span className="ml-1 px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-mono text-[11px] border border-indigo-200/60 lowercase">
              {toolName}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-slate-400">
          {isActionObj && (
            <button
              onClick={() => setShowRawJson(!showRawJson)}
              className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
            >
              {showRawJson ? 'Formatted' : 'Raw JSON'}
            </button>
          )}

          <button
            onClick={handleCopy}
            className="p-1 hover:text-slate-700 rounded transition-colors"
            title="Copy content"
          >
            {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
          </button>
        </div>
      </div>

      {/* Body Content */}
      {isJson ? (
        showRawJson || !isActionObj ? (
          <pre className="text-[11px] bg-slate-900 text-slate-100 p-2.5 rounded-md overflow-x-auto font-mono max-h-60 overflow-y-auto leading-relaxed">
            {JSON.stringify(content, null, 2)}
          </pre>
        ) : (
          /* Formatted Parameter Grid */
          <div className="space-y-1.5 pt-0.5">
            {toolArgs && Object.keys(toolArgs).length > 0 ? (
              <div className="grid grid-cols-1 gap-1.5">
                {Object.entries(toolArgs).map(([key, val]) => (
                  <div key={key} className="flex items-start gap-2 bg-slate-50/80 p-2 rounded border border-slate-100 font-mono text-[11px]">
                    <span className="text-indigo-600 font-semibold flex-shrink-0">{key}:</span>
                    <span className="text-slate-800 break-all select-all">
                      {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-400 italic text-[11px]">No arguments passed.</p>
            )}
          </div>
        )
      ) : (
        /* Standard Text Content (Observation or Status) */
        <div className="text-slate-700 leading-relaxed font-sans whitespace-pre-wrap break-words bg-slate-50/60 p-2 rounded border border-slate-100">
          {content}
        </div>
      )}
    </div>
  );
});

export default CoTStep;
