import React from 'react';
import { Brain } from 'lucide-react';

const StructuredThought = React.memo(({ thought }) => (
  <div className="space-y-3 p-3 bg-purple-50 border-l-4 border-purple-400">
    <div className="flex items-center gap-2 mb-2">
      <Brain className="h-4 w-4 flex-shrink-0 text-purple-700" />
      <h4 className="font-semibold text-sm uppercase tracking-wider text-purple-800">Chain of Thought</h4>
    </div>
    <div className="text-sm space-y-2 text-gray-700 pl-1">
      <p><strong>Observation:</strong> {thought.observation_summary || 'N/A'}</p>
      <p><strong>Goal Analysis:</strong> {thought.goal_analysis || 'N/A'}</p>
      <p><strong>Strategy:</strong> {thought.strategy_and_critique || 'N/A'}</p>
      <p className="font-semibold text-indigo-700 mt-2">Recommendation: {thought.recommendation || 'N/A'}</p>
    </div>
  </div>
));

export default StructuredThought;