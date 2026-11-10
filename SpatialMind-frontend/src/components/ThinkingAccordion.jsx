import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Activity, Terminal, Eye, Layers, CheckCircle2 } from 'lucide-react';
import StructuredThought from './StructuredThought.jsx';
import CoTStep from './CoTStep.jsx';

/**
 * Collapsible Thinking Accordion:
 * Professional, enterprise-grade AI execution trace with timeline aesthetics.
 * Hides raw intermediate reasoning by default and provides a structured audit trail upon inspection.
 */
export const ThinkingAccordion = ({ cot, isLive = false }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!cot) return null;

  const hasThought = Boolean(cot.chain_of_thought);
  const hasAction = Boolean(cot.action);
  const hasObservation = Boolean(cot.observation);
  const hasStatus = Boolean(cot.status_update);

  if (!hasThought && !hasAction && !hasObservation && !hasStatus) {
    return null;
  }

  const stepsCount = [hasStatus, hasThought, hasAction, hasObservation].filter(Boolean).length;
  const activeTool = cot.action?.action?.tool || cot.action?.tool;

  return (
    <div className="my-2.5 border border-slate-200/90 rounded-lg overflow-hidden bg-slate-50/50 shadow-2xs transition-all">
      {/* Toggle Header Button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100/70 hover:bg-slate-200/60 transition-colors cursor-pointer"
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-2 min-w-0">
          {isLive ? (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-600"></span>
            </span>
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />
          )}

          <span className="font-semibold text-slate-800 truncate">
            {isLive ? 'Executing spatial pipeline...' : `Reasoning Trace`}
          </span>

          {!isLive && (
            <span className="px-1.5 py-0.2 rounded bg-slate-200/70 text-slate-600 text-[10px] font-mono">
              {stepsCount} step{stepsCount > 1 ? 's' : ''}
            </span>
          )}

          {activeTool && (
            <span className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-200/60 text-[10px] font-mono">
              <Terminal className="h-2.5 w-2.5 text-indigo-500" />
              {activeTool}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-slate-500 flex-shrink-0">
          <span className="text-[11px] font-medium">{isExpanded ? 'Hide Trace' : 'Inspect Trace'}</span>
          {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-slate-600" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-600" />}
        </div>
      </button>

      {/* Collapsible Content */}
      {isExpanded && (
        <div className="p-3.5 space-y-3 bg-white border-t border-slate-200/90 text-xs">
          {/* Timeline Connector Container */}
          <div className="relative pl-4 space-y-3 before:absolute before:left-1.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
            {cot.status_update && (
              <div className="relative">
                <div className="absolute -left-4 top-1.5 w-2.5 h-2.5 rounded-full bg-slate-400 border-2 border-white ring-1 ring-slate-300" />
                <CoTStep
                  title="System Status"
                  content={cot.status_update.message}
                  icon={Activity}
                />
              </div>
            )}

            {cot.chain_of_thought && (
              <div className="relative">
                <div className="absolute -left-4 top-1.5 w-2.5 h-2.5 rounded-full bg-indigo-500 border-2 border-white ring-1 ring-indigo-300" />
                <StructuredThought thought={cot.chain_of_thought} />
              </div>
            )}

            {cot.action && (
              <div className="relative">
                <div className="absolute -left-4 top-1.5 w-2.5 h-2.5 rounded-full bg-blue-500 border-2 border-white ring-1 ring-blue-300" />
                <CoTStep
                  title="Tool Execution"
                  content={cot.action.action || cot.action}
                  icon={Terminal}
                  isJson={true}
                />
              </div>
            )}

            {cot.observation && (
              <div className="relative">
                <div className="absolute -left-4 top-1.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white ring-1 ring-emerald-300" />
                <CoTStep
                  title="Spatial Observation"
                  content={cot.observation.observation || cot.observation}
                  icon={Eye}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ThinkingAccordion;
