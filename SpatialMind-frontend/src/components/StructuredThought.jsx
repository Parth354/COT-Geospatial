import React from 'react';
import { Brain } from 'lucide-react';

const StructuredThought = React.memo(({ thought }) => {
  // Only show fields that have actual content (not empty, null, undefined, or 'N/A')
  const hasContent = (value) => {
    if (!value) return false;
    const str = String(value).trim();
    return str !== '' && str !== 'N/A' && str !== 'null' && str !== 'undefined';
  };

  const fields = [];
  
  if (hasContent(thought.observation_summary)) {
    fields.push({ label: 'Observation', value: thought.observation_summary });
  }
  if (hasContent(thought.goal_analysis)) {
    fields.push({ label: 'Goal Analysis', value: thought.goal_analysis });
  }
  if (hasContent(thought.strategy_and_critique)) {
    fields.push({ label: 'Strategy', value: thought.strategy_and_critique });
  }
  if (hasContent(thought.recommendation)) {
    fields.push({ label: 'Recommendation', value: thought.recommendation, isRecommendation: true });
  }

  // Don't render if no fields have content
  if (fields.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3 p-4 bg-purple-50 border-l-4 border-purple-400 max-w-md w-full">
      <div className="flex items-center gap-2 mb-3">
        <Brain className="h-4 w-4 flex-shrink-0 text-purple-700" />
        <h4 className="font-semibold text-sm uppercase tracking-wider text-purple-800">Chain of Thought</h4>
      </div>
      <div className="text-sm space-y-3 text-gray-700 pl-1">
        {fields.map((field, idx) => (
          <p 
            key={idx}
            className={`break-words ${field.isRecommendation ? "font-semibold text-indigo-700 mt-2" : ""}`}
          >
            <strong>{field.label}:</strong> {field.value}
          </p>
        ))}
      </div>
    </div>
  );
});

export default StructuredThought;