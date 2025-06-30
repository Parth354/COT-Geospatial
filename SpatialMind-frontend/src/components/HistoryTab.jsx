import React from 'react';
import { Code } from 'lucide-react';


const HistoryTab = React.memo(({ history }) => {
    if (!history || history.length === 0) {
        return (
            <div className="text-center text-gray-400 py-8">
                <Code className="h-10 w-10 mx-auto mb-3" />
                <p className="text-sm font-medium">No Agent History</p>
                <p className="text-xs">The agent's thought process was not recorded.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4 text-xs font-mono bg-gray-900 text-gray-300 p-4 rounded-lg overflow-x-auto max-h-[40vh]">
            {history.map((step, index) => (
                <div key={index} className="border-l-2 border-gray-700 pl-4 py-2 hover:bg-gray-800 transition-colors">
                    <p className="text-green-400 font-bold mb-1">[Step {index + 1}]</p>
                    <div className="text-purple-400">Thought:</div>
                    <div className="pl-4 text-gray-300 whitespace-pre-wrap">{JSON.stringify(step.thought, null, 2)}</div>
                    <div className="text-blue-400 mt-2">Action:</div>
                    <div className="pl-4 text-gray-300 whitespace-pre-wrap">{JSON.stringify(step.action, null, 2)}</div>
                    <div className="text-cyan-400 mt-2">Observation:</div>
                    <p className="pl-4 text-gray-300 whitespace-pre-wrap">{step.observation}</p>
                </div>
            ))}
        </div>
    );
});

export default HistoryTab;