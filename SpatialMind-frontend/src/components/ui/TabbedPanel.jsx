import React, { useState } from 'react';
import { Cloud, BarChart3 } from 'lucide-react';

export const TabbedPanel = ({ tabs }) => {
  const [activeTab, setActiveTab] = useState(tabs[0].id);
  const ActiveComponent = tabs.find(tab => tab.id === activeTab).component;

  return (
    <div className="flex flex-col h-full bg-white rounded-lg shadow-sm border">
      {/* Tab Buttons */}
      <div className="flex-shrink-0 border-b">
        <nav className="flex space-x-2 px-2">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-2 py-3 px-4 text-sm font-medium border-b-2 ${
                activeTab === tab.id
                  ? 'text-blue-600 border-blue-500'
                  : 'text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="flex-grow p-4 overflow-y-auto">
        <ActiveComponent />
      </div>
    </div>
  );
};