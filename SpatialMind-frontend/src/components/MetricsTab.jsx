import React from 'react';
import { BarChart3 } from 'lucide-react';

const MetricsTab = React.memo(({ metrics }) => {
    const metricEntries = Object.entries(metrics || {});

    if (metricEntries.length === 0) {
        return (
            <div className="text-center text-gray-400 py-8">
                <BarChart3 className="h-10 w-10 mx-auto mb-3" />
                <p className="text-sm font-medium">No Metrics Available</p>
                <p className="text-xs">The analysis did not compute any quantitative metrics.</p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {metricEntries.map(([key, value]) => (
                <div key={key} className="bg-indigo-50 p-4 rounded-lg">
                    <p className="text-xs font-semibold text-indigo-500 uppercase tracking-wider">{key.replace(/_/g, ' ')}</p>
                    <p className="text-2xl font-bold text-indigo-900 mt-1">{typeof value === 'number' ? value.toLocaleString() : value}</p>
                </div>
            ))}
        </div>
    );
});

export default MetricsTab;
