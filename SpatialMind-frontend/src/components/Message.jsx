import React, { useState } from 'react';
import {
  User, Layers, CheckCircle, AlertCircle, Database,
  Copy, Check, Activity, Terminal, Settings
} from 'lucide-react';
import { useAppContext } from '../hooks/AppContext';
import ThinkingAccordion from './ThinkingAccordion.jsx';
import MarkdownRenderer from './ui/MarkdownRenderer.jsx';
import CoTStep from './CoTStep.jsx';

const Message = React.memo(({ msg }) => {
  const [copied, setCopied] = useState(false);
  const { actions } = useAppContext();

  // User Message
  if (msg.type === 'user') {
    return (
      <div className="flex justify-end mb-4">
        <div className="flex items-start gap-2.5 flex-row-reverse max-w-[85%]">
          <div className="w-7 h-7 rounded-lg bg-slate-700 flex items-center justify-center text-white shadow-xs flex-shrink-0 mt-0.5">
            <User className="h-3.5 w-3.5" />
          </div>
          <div className="bg-slate-800 text-white rounded-xl rounded-tr-xs px-3.5 py-2 text-xs shadow-xs leading-relaxed break-words font-sans">
            {msg.content}
          </div>
        </div>
      </div>
    );
  }

  // Assistant Message
  if (msg.type === 'assistant' && msg.cot) {
    const hasFinalStatus = Boolean(msg.cot.final_status);
    const isCompleted = msg.cot.final_status?.status === 'completed';
    const messageContent = msg.cot.final_status?.message || '';
    const summary = msg.cot.final_status?.analysis_summary;

    const handleCopy = () => {
      if (messageContent) {
        navigator.clipboard.writeText(messageContent);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    };

    return (
      <div className="flex justify-start mb-4">
        <div className="flex items-start gap-2.5 max-w-[95%] w-full">
          <div className="w-7 h-7 rounded-lg bg-indigo-700 flex items-center justify-center text-white shadow-xs flex-shrink-0 mt-0.5">
            <Layers className="h-3.5 w-3.5" />
          </div>

          <div className="flex-1 bg-white rounded-xl rounded-tl-xs p-3.5 shadow-xs border border-gray-200/90 w-full overflow-hidden min-w-0 transition-all">
            {/* Header info / Badge */}
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-gray-100 text-xs text-gray-500">
              <span className="font-semibold text-gray-800 flex items-center gap-1.5 text-xs">
                <Activity className="h-3.5 w-3.5 text-indigo-600" />
                SpatialMind
              </span>
              
              <div className="flex items-center gap-2">
                {hasFinalStatus && (
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold tracking-wide uppercase ${
                    isCompleted ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"
                  }`}>
                    {isCompleted ? <CheckCircle className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                    {isCompleted ? "Complete" : "Failed"}
                  </span>
                )}

                {messageContent && (
                  <button
                    onClick={handleCopy}
                    className="p-1 text-gray-400 hover:text-gray-700 rounded transition-colors"
                    title="Copy response text"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                )}
              </div>
            </div>

            {/* Ingestion status alerts if present */}
            {msg.cot.ingestion_complete && (
              <div className="mb-2">
                <CoTStep title="Ingestion Complete" content={msg.cot.ingestion_complete.message} icon={Database} color="border-cyan-500 bg-cyan-50" />
              </div>
            )}
            {msg.cot.ingestion_failed && (
              <div className="mb-2">
                <CoTStep title="Ingestion Failed" content={msg.cot.ingestion_failed.message} icon={AlertCircle} color="border-red-500 bg-red-50" />
              </div>
            )}

            {/* 1. Collapsible Thinking Process (Hidden by Default!) */}
            <ThinkingAccordion cot={msg.cot} isLive={!hasFinalStatus} />

            {/* 2. Main Final Answer / Result */}
            {hasFinalStatus ? (
              <div className="mt-2 text-gray-800 text-xs leading-relaxed">
                <MarkdownRenderer content={messageContent} />

                {/* One-Click Action Button if message mentions Settings panel */}
                {messageContent.toLowerCase().includes('settings panel') && (
                  <div className="mt-3 pt-2">
                    <button
                      onClick={() => actions?.openSettings?.()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                    >
                      <Settings className="h-3.5 w-3.5" />
                      <span>Open Settings Panel</span>
                    </button>
                  </div>
                )}

                {/* Structured Analysis Badges (Clean vector icons) */}
                {summary && (summary.datasets_used?.length > 0 || summary.tools_executed?.length > 0) && (
                  <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap gap-1.5 text-xs">
                    {summary.datasets_used?.map((ds, i) => (
                      <span key={`ds-${i}`} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-50 text-slate-700 border border-slate-200 text-[11px] font-mono">
                        <Database className="h-3 w-3 text-slate-500" />
                        {ds}
                      </span>
                    ))}
                    {summary.tools_executed?.map((tool, i) => (
                      <span key={`tool-${i}`} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px] font-mono">
                        <Terminal className="h-3 w-3 text-indigo-500" />
                        {tool}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              // Live reasoning placeholder before final answer arrives
              <div className="text-xs text-gray-500 italic py-1 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-pulse" />
                <span>Executing spatial reasoning pipeline...</span>
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
