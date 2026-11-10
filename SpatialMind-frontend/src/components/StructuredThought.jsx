import React, { useState } from 'react';
import { Cpu, Target, Compass, ArrowRight, Check, Copy, Eye } from 'lucide-react';

export const StructuredThought = React.memo(({ thought }) => {
  const [copied, setCopied] = useState(false);

  if (!thought) return null;

  // Normalize if nested under thought.thought
  const t = thought.thought || thought;

  const hasContent = (val) => {
    if (!val) return false;
    const s = String(val).trim();
    return s !== '' && s !== 'N/A' && s !== 'null' && s !== 'undefined';
  };

  const observation = hasContent(t.observation_summary) ? t.observation_summary : null;
  const goal = hasContent(t.goal_analysis) ? t.goal_analysis : null;
  const strategy = hasContent(t.strategy_and_critique) ? t.strategy_and_critique : null;
  const recommendation = hasContent(t.recommendation) ? t.recommendation : null;

  if (!observation && !goal && !strategy && !recommendation) {
    return null;
  }

  const handleCopy = () => {
    const text = [
      goal ? `Goal: ${goal}` : '',
      strategy ? `Strategy: ${strategy}` : '',
      observation ? `Observation: ${observation}` : '',
      recommendation ? `Next Step: ${recommendation}` : ''
    ].filter(Boolean).join('\n\n');

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg border border-indigo-100 bg-gradient-to-b from-indigo-50/40 to-slate-50/50 p-3 shadow-xs transition-all">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-indigo-100/70">
        <div className="flex items-center gap-1.5 text-indigo-900 font-semibold text-[11px] tracking-wide uppercase">
          <Cpu className="h-3.5 w-3.5 text-indigo-600" />
          <span>Analytical Execution Plan</span>
        </div>
        <button
          onClick={handleCopy}
          className="text-slate-400 hover:text-slate-700 p-0.5 rounded transition-colors"
          title="Copy reasoning trace"
        >
          {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
        </button>
      </div>

      {/* Grid of Structured Elements */}
      <div className="space-y-2 text-xs leading-relaxed text-slate-700">
        {goal && (
          <div className="flex items-start gap-2">
            <Target className="h-3.5 w-3.5 text-indigo-500 mt-0.5 flex-shrink-0" />
            <div>
              <span className="font-semibold text-slate-800 text-[11px] uppercase tracking-wider block">Goal</span>
              <p className="text-slate-700 mt-0.5">{goal}</p>
            </div>
          </div>
        )}

        {strategy && (
          <div className="flex items-start gap-2">
            <Compass className="h-3.5 w-3.5 text-slate-500 mt-0.5 flex-shrink-0" />
            <div>
              <span className="font-semibold text-slate-800 text-[11px] uppercase tracking-wider block">Strategy</span>
              <p className="text-slate-600 mt-0.5">{strategy}</p>
            </div>
          </div>
        )}

        {observation && (
          <div className="flex items-start gap-2">
            <Eye className="h-3.5 w-3.5 text-sky-500 mt-0.5 flex-shrink-0" />
            <div>
              <span className="font-semibold text-slate-800 text-[11px] uppercase tracking-wider block">Observation</span>
              <p className="text-slate-600 mt-0.5">{observation}</p>
            </div>
          </div>
        )}

        {recommendation && (
          <div className="mt-2.5 pt-2 border-t border-indigo-100/60 flex items-start gap-2 bg-indigo-50/60 -mx-3 -mb-3 p-2.5 rounded-b-lg">
            <ArrowRight className="h-3.5 w-3.5 text-indigo-600 mt-0.5 flex-shrink-0" />
            <div className="min-w-0">
              <span className="font-semibold text-indigo-900 text-[11px] uppercase tracking-wider block">Planned Action</span>
              <p className="text-indigo-950 font-medium mt-0.5">{recommendation}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

export default StructuredThought;
