import React, { useState, useEffect, useRef } from 'react';
import {
  Send, Terminal, Compass, Loader, X,
  Waves, Ruler, Building2, Database, AlertCircle, CheckCircle2
} from 'lucide-react';
import webSocketService from '../socket/websocket.js';
import { useAppContext } from '../hooks/AppContext';
import Message from './Message.jsx';
import { queryAPI } from '../api/queryAPI.js';
import { sessionAPI } from '../api/api.js';

const PROMPT_SUGGESTIONS = [
  {
    icon: Waves,
    iconColor: 'text-sky-600 bg-sky-50 border-sky-200',
    label: 'Terrain Elevation Analysis',
    query: 'Identify low-lying flood-prone units in Delhi with elevation below 210 meters',
  },
  {
    icon: Ruler,
    iconColor: 'text-indigo-600 bg-indigo-50 border-indigo-200',
    label: 'Proximity Buffer (500m)',
    query: 'Calculate a 500-meter buffer zone around high-risk flood polygons',
  },
  {
    icon: Building2,
    iconColor: 'text-slate-600 bg-slate-50 border-slate-200',
    label: 'Urban Hazard Overlay',
    query: 'Intersect commercial zones with flood polygons to assess exposure',
  },
  {
    icon: Database,
    iconColor: 'text-emerald-600 bg-emerald-50 border-emerald-200',
    label: 'Dataset Catalog Audit',
    query: 'List all datasets registered in the workspace catalog',
  },
];

function ChatWindow() {
  const { state, actions } = useAppContext();
  const {
    messages,
    isAgentLoading,
    websocketConnected,
    activeJobId,
    uploadedDatasets,
    sessionId,
    agentStatusMessage,
  } = state;

  const [inputMessage, setInputMessage] = useState('');
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const executeQuery = async (queryText) => {
    const trimmed = queryText.trim();
    if (!trimmed || isAgentLoading || !websocketConnected) return;

    actions.addUserMessage(trimmed);
    setInputMessage('');

    try {
      let currentSessionId = sessionId;
      if (!currentSessionId) {
        currentSessionId = await sessionAPI.getSession();
        actions.setSessionId(currentSessionId);
      }

      const context = {
        uploaded_datasets: uploadedDatasets.map((d) => d.dataset_id),
      };
      await queryAPI.submitQuery(
        { query: trimmed, sessionId: currentSessionId, context },
        actions
      );
    } catch (err) {
      console.error('Query submission failed:', err);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    executeQuery(inputMessage);
  };

  const handleClearChat = () => {
    if (activeJobId) {
      webSocketService.unsubscribe(activeJobId);
    }
    actions.clearChat();
  };

  return (
    <div className="flex flex-col h-full bg-slate-50/60 min-w-0">
      {/* Header */}
      <header className="px-4 py-3 bg-white border-b border-gray-200/80 flex justify-between items-center flex-shrink-0 min-w-0 shadow-xs">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-lg bg-slate-900 text-cyan-400 shadow-xs">
            <Terminal className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-xs font-bold text-gray-900 tracking-tight">Geospatial Processing Console</h2>
            <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
              <span className={`w-1.5 h-1.5 rounded-full ${websocketConnected ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
              <span>{websocketConnected ? 'Operational' : 'Connecting to Core...'}</span>
            </div>
          </div>
        </div>

        {messages.length > 0 && !isAgentLoading && (
          <button
            onClick={handleClearChat}
            className="text-xs text-gray-400 hover:text-red-600 flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
            title="Clear Chat Session"
          >
            <X className="h-3.5 w-3.5" />
            <span>Reset</span>
          </button>
        )}
      </header>

      {/* Messages Scroll Area */}
      <main className="flex-1 overflow-y-auto p-4 space-y-4 min-w-0">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 pt-6 pb-4 max-w-sm mx-auto">
            <div className="w-10 h-10 mx-auto mb-2.5 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-indigo-700 shadow-xs">
              <Compass className="h-5 w-5" />
            </div>
            <h3 className="font-bold text-gray-900 text-sm mb-1">Spatial Analytics Workstation</h3>
            <p className="text-xs text-gray-500 leading-relaxed mb-5">
              Execute vector spatial operators, raster terrain analysis, multi-modal routing, or live telemetry audits.
            </p>

            {/* Quick Suggestions Chips (Clean, Professional Icons) */}
            <div className="text-left space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block px-1">
                Standard Query Templates
              </span>
              <div className="grid grid-cols-1 gap-1.5">
                {PROMPT_SUGGESTIONS.map((item, idx) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={idx}
                      onClick={() => executeQuery(item.query)}
                      disabled={!websocketConnected || isAgentLoading}
                      className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white border border-gray-200/90 text-left hover:border-indigo-400 hover:shadow-xs transition-all text-xs text-gray-700 group disabled:opacity-50"
                    >
                      <div className={`p-1.5 rounded-lg border ${item.iconColor} flex-shrink-0`}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <span className="font-medium flex-1 truncate">{item.label}</span>
                      <span className="text-[11px] text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity font-mono">
                        Execute →
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {!websocketConnected && (
              <div className="mt-4 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-xs flex items-center gap-2 text-left">
                <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                <span>Connecting to spatial engine telemetry stream...</span>
              </div>
            )}
          </div>
        )}

        {/* Message Thread */}
        {messages.map((msg) => (
          <Message key={msg.id} msg={msg} />
        ))}

        <div ref={messagesEndRef} />
      </main>

      {/* Footer & Input Bar */}
      <footer className="p-3 bg-white border-t border-gray-200/80 flex-shrink-0">
        {/* Status indicator bar */}
        {isAgentLoading && (
          <div className="flex items-center gap-2 mb-2 px-1 text-xs text-indigo-800 bg-indigo-50 py-1.5 px-3 rounded-lg border border-indigo-100 animate-pulse">
            <Loader className="h-3.5 w-3.5 animate-spin text-indigo-600 flex-shrink-0" />
            <span className="truncate font-medium">{agentStatusMessage || 'Executing spatial operations...'}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex gap-2 items-center">
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder={
              isAgentLoading
                ? 'Geoprocessing pipeline active...'
                : websocketConnected
                ? 'Enter spatial operator (e.g., elevation < 220m or route to AIIMS)...'
                : 'Connecting to engine...'
            }
            disabled={isAgentLoading || !websocketConnected}
            className="flex-1 px-3.5 py-2 text-xs border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 bg-white placeholder-gray-400 disabled:bg-gray-100 disabled:cursor-not-allowed transition-all"
          />
          <button
            type="submit"
            disabled={isAgentLoading || !inputMessage.trim() || !websocketConnected}
            className="bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white px-3.5 py-2 rounded-xl text-xs font-semibold shadow-xs disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-1.5 transition-all flex-shrink-0"
          >
            {isAgentLoading ? (
              <Loader className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">Submit</span>
          </button>
        </form>
      </footer>
    </div>
  );
}

export default ChatWindow;
