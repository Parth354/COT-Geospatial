import React, { useState, useEffect, useRef } from 'react';
import {  Send,  MessageSquare, Brain, Loader, Wifi, WifiOff, X} from 'lucide-react';
import webSocketService from '../socket/websocket.js';
import { useAppContext } from '../hooks/AppContext';
import Message from './Message.jsx';
import { queryAPI } from '../api/queryAPI.js';
import { sessionAPI } from '../api/api.js';


function ChatWindow() {
  const { state, actions } = useAppContext();
  const { messages, isAgentLoading, websocketConnected, activeJobId, uploadedDatasets, sessionId, agentStatusMessage } = state;

  const [inputMessage, setInputMessage] = useState('');
  const messagesEndRef = useRef(null);


  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmedInput = inputMessage.trim();
    if (!trimmedInput || isAgentLoading || !websocketConnected) return;

    actions.addUserMessage(trimmedInput);
    setInputMessage('');

    try {
      let currentSessionId = sessionId;
      if (!currentSessionId) {
        currentSessionId = await sessionAPI.getSession();
        actions.setSessionId(currentSessionId);
      }
      
      const context = {
        uploaded_datasets: uploadedDatasets.map(d => d.dataset_id),
      };
      await queryAPI.submitQuery({ query: trimmedInput, sessionId: currentSessionId, context }, actions);

    } catch (err) {
      console.error("Query submission failed:", err);
    }
  };

  const handleClearChat = () => {
    if (activeJobId) {
      webSocketService.unsubscribe(activeJobId);
    }
    actions.clearChat();
  };

  return (
    <div className="flex flex-col h-full bg-gray-100 border rounded-lg shadow-inner">
      <header className="p-3 bg-white border-b flex justify-between items-center rounded-t-lg">
        <h2 className="flex items-center text-lg font-semibold text-gray-900 gap-2">
          <MessageSquare className="h-5 w-5 text-indigo-600" />
          Geospatial AI Analyst
        </h2>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs font-medium" title={websocketConnected ? 'Connected to Server' : 'Disconnected from Server'}>
            {websocketConnected ? <Wifi className="h-4 w-4 text-green-600" /> : <WifiOff className="h-4 w-4 text-red-500" />}
            <span>{websocketConnected ? 'Connected' : 'Offline'}</span>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 pt-16">
            <Brain className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p className="font-medium text-gray-600">Welcome to SpatialMind</p>
            <p className="text-sm">Ask a question or upload data to begin your analysis.</p>
          </div>
        )}
        {messages.map((msg) => <Message key={msg.id} msg={msg} />)}
        <div ref={messagesEndRef} />
      </main>

      <footer className="p-4 bg-white border-t rounded-b-lg">
        <div className="flex items-center justify-between mb-2 px-1 h-5">
          <div className="text-xs text-gray-500 transition-opacity duration-300">
            {isAgentLoading && (
              <span className="flex items-center gap-2">
                <Loader className="h-3 w-3 animate-spin"/>
                {agentStatusMessage}
              </span>
            )}
          </div>
          {messages.length > 0 && !isAgentLoading && (
            <button onClick={handleClearChat} className="text-xs text-gray-400 hover:text-red-600 flex items-center gap-1">
              <X className="h-3 w-3" /> Clear Chat
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={inputMessage}
            onChange={e => setInputMessage(e.target.value)}
            placeholder={isAgentLoading ? "Agent is processing..." : (websocketConnected ? "Ask a geospatial question..." : "Connecting to server...")}
            disabled={isAgentLoading || !websocketConnected}
            className="flex-1 p-2 border rounded-md focus:ring-2 focus:ring-blue-400 disabled:bg-gray-100"
          />
          <button
            type="submit"
            disabled={isAgentLoading || !inputMessage.trim() || !websocketConnected}
            className="bg-blue-600 text-white px-5 py-2 rounded-md hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
          >
            {isAgentLoading ? <Loader className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send
          </button>
        </form>
      </footer>
    </div>
  );
}

export default ChatWindow;