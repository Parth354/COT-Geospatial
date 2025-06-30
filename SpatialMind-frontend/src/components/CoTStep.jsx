import React from 'react';

const CoTStep = React.memo(({ title, content, icon: Icon, color, isJson = false }) => (
  <div className={`p-3 border-l-4 ${color} bg-opacity-50`}>
    <div className="flex items-center gap-2 mb-2">
      <Icon className="h-4 w-4 flex-shrink-0" />
      <h4 className="font-semibold text-sm uppercase tracking-wider text-gray-800">{title}</h4>
    </div>
    {isJson ? (
      <pre className="text-xs bg-gray-900 text-white p-3 rounded-md overflow-x-auto font-mono">
        {JSON.stringify(content, null, 2)}
      </pre>
    ) : (
      <div className="text-sm text-gray-700 whitespace-pre-wrap">{content}</div>
    )}
  </div>
));

export default CoTStep;
