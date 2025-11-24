import React from 'react';

const CoTStep = React.memo(({ title, content, icon: Icon, color, isJson = false }) => (
  <div className={`p-4 border-l-4 ${color} bg-opacity-50 max-w-md w-full`}>
    <div className="flex items-center gap-2 mb-3">
      <Icon className="h-4 w-4 flex-shrink-0" />
      <h4 className="font-semibold text-sm uppercase tracking-wider text-gray-800">{title}</h4>
    </div>
    {isJson ? (
      <pre className="text-xs bg-gray-900 text-white p-3 rounded-md overflow-x-auto font-mono max-h-96 overflow-y-auto">
        {JSON.stringify(content, null, 2)}
      </pre>
    ) : (
      <div className="text-sm text-gray-700 whitespace-pre-wrap break-words">{content}</div>
    )}
  </div>
));

export default CoTStep;
