import React, { useState } from 'react';
import { Code, ChevronDown, ChevronRight, Terminal, Eye, Brain, Sparkles, Check, Copy } from 'lucide-react';
import StructuredThought from './StructuredThought.jsx';
import CoTStep from './CoTStep.jsx';

const HistoryTab = React.memo(({ history }) => {
  const [openSteps, setOpenSteps] = useState({});
  const [allExpanded, setAllExpanded] = useState(false);

  if (!history || history.length === 0) {
    return (
      <div className="text-center text-slate-400 py-12">
        <Code className="h-10 w-10 mx-auto mb-2 text-slate-300" />
        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">No Execution Trace Recorded</p>
        <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
          The query was handled via a direct conversational route or intermediate trace logs were cleared.
        </p>
      </div>
    );
  }

  const toggleStep = (idx) => {
    setOpenSteps((prev) => ({
      ...prev,
      [idx]: !prev[idx]
    }));
  };

  const handleToggleAll = () => {
    const nextState = !allExpanded;
    setAllExpanded(nextState);
    const updated = {};
    history.forEach((_, i) => {
      updated[i] = nextState;
    });
    setOpenSteps(updated);
  };

  return (
    <div className="space-y-3 p-1">
      {/* Top Controls Bar */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-200 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-700">Execution Timeline</span>
          <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-mono text-[11px] font-medium border border-indigo-200/60">
            {history.length} analytical step{history.length > 1 ? 's' : ''}
          </span>
        </div>

        <button
          onClick={handleToggleAll}
          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium px-2 py-1 rounded hover:bg-indigo-50/60 transition-colors cursor-pointer"
        >
          {allExpanded ? 'Collapse All' : 'Expand All'}
        </button>
      </div>

      {/* Stepper Timeline List */}
      <div className="relative pl-4 space-y-3 before:absolute before:left-2 before:top-4 before:bottom-4 before:w-0.5 before:bg-slate-200">
        {history.map((step, index) => {
          const isOpen = Boolean(openSteps[index]);
          const toolName = step.action?.tool || 'analysis_step';
          const args = step.action?.args || {};

          return (
            <div key={index} className="relative">
              {/* Stepper Node Marker */}
              <div className="absolute -left-4 top-3 w-4 h-4 rounded-full bg-white border-2 border-indigo-600 flex items-center justify-center shadow-xs">
                <span className="text-[9px] font-bold text-indigo-600">{index + 1}</span>
              </div>

              {/* Step Card */}
              <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-2xs transition-all">
                <button
                  onClick={() => toggleStep(index)}
                  className="w-full flex items-center justify-between p-3 text-left hover:bg-slate-50 transition-colors cursor-pointer"
                  aria-expanded={isOpen}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-mono text-xs font-semibold border border-indigo-200/60">
                      {toolName}
                    </span>

                    {/* Preview of key argument if present */}
                    {Object.keys(args).length > 0 && (
                      <span className="text-[11px] text-slate-500 font-mono truncate max-w-xs hidden sm:inline-block">
                        {Object.entries(args).map(([k, v]) => `${k}=${typeof v === 'object' ? '...' : v}`).join(', ')}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 text-slate-400 flex-shrink-0">
                    <span className="text-[11px] font-medium">{isOpen ? 'Hide' : 'Inspect'}</span>
                    {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-slate-600" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-600" />}
                  </div>
                </button>

                {/* Expanded Inspection Body */}
                {isOpen && (
                  <div className="p-3 bg-slate-50/70 border-t border-slate-200 space-y-3 text-xs">
                    {step.thought && (
                      <StructuredThought thought={step.thought} />
                    )}

                    {step.action && (
                      <CoTStep
                        title="Executed Action"
                        content={step.action}
                        icon={Terminal}
                        isJson={true}
                      />
                    )}

                    {step.observation && (
                      <CoTStep
                        title="Tool Output & Observation"
                        content={step.observation}
                        icon={Eye}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

export default HistoryTab;
