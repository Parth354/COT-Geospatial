import React, { useState } from 'react';

export const TabbedPanel = ({ tabs, defaultTabId, activeTab: controlledTab, onTabChange }) => {
  const [internalTab, setInternalTab] = useState(defaultTabId || tabs[0]?.id);
  const activeTab = controlledTab !== undefined ? controlledTab : internalTab;

  const handleSelectTab = (id) => {
    setInternalTab(id);
    if (onTabChange) onTabChange(id);
  };

  const activeItem = tabs.find(tab => tab.id === activeTab) || tabs[0];
  const ActiveComponent = activeItem?.component;
  const noPadding = activeItem?.noPadding ?? (activeItem?.id === 'chat');

  return (
    <div className="flex flex-col h-full bg-white rounded-lg shadow-sm border overflow-hidden">
      {/* Tab Buttons Header */}
      <div className="flex-shrink-0 border-b bg-gray-50/80">
        <nav className="flex space-x-1 px-3 pt-2">
          {tabs.map(tab => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => handleSelectTab(tab.id)}
                className={`flex items-center space-x-2 py-2.5 px-3.5 text-xs font-semibold rounded-t-md transition-all ${
                  isActive
                    ? 'bg-white text-indigo-700 border-t-2 border-indigo-600 shadow-xs'
                    : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100/60'
                }`}
              >
                {Icon && <Icon className="h-4 w-4" />}
                <span>{tab.label}</span>
                {tab.badge !== undefined && (
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                    isActive ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-200 text-gray-600'
                  }`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className={`flex-grow min-h-0 ${noPadding ? 'flex flex-col overflow-hidden' : 'p-4 overflow-y-auto'}`}>
        {ActiveComponent && <ActiveComponent />}
      </div>
    </div>
  );
};

export default TabbedPanel;
