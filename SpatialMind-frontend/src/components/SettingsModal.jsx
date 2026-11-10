import React, { useState, useEffect } from 'react';
import {
  X, Key, ShieldCheck, CheckCircle2, AlertCircle, Loader2, Eye, EyeOff,
  Cpu, ExternalLink, Lock, Globe, Server, Plus, Trash2, RefreshCw, Check,
  BookOpen, Terminal, Code, CheckCircle, ChevronDown, ChevronRight
} from 'lucide-react';
import { api } from '../api/api.js';

export const SettingsModal = ({ isOpen, onClose, onKeySaved }) => {
  const [activeTab, setActiveTab] = useState('llm'); // 'llm' | 'apis' | 'custom' | 'mcp'

  // LLM State
  const [provider, setProvider] = useState('groq');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [selectedModel, setSelectedModel] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [isCustomModel, setIsCustomModel] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const [keyStatus, setKeyStatus] = useState(null);

  // Geospatial APIs State
  const [integrationsData, setIntegrationsData] = useState(null);
  const [apiInputs, setApiInputs] = useState({});
  const [apiShowKeys, setApiShowKeys] = useState({});
  const [apiLoading, setApiLoading] = useState({});
  const [apiStatusMessage, setApiStatusMessage] = useState(null);

  // Custom Data APIs State
  const [customApis, setCustomApis] = useState([]);
  const [specGuide, setSpecGuide] = useState(null);
  const [showSpecGuide, setShowSpecGuide] = useState(false);
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [customLoading, setCustomLoading] = useState(false);
  const [validatingCustom, setValidatingCustom] = useState(false);
  const [customValidationResult, setCustomValidationResult] = useState(null);
  const [customStatusMessage, setCustomStatusMessage] = useState(null);
  const [newCustom, setNewCustom] = useState({
    name: '',
    url: '',
    method: 'GET',
    auth_type: 'none',
    auth_key: '',
    auth_value: '',
    response_format: 'geojson_feature_collection',
    description: '',
    enabled: true
  });

  // MCP Servers State
  const [mcpServers, setMcpServers] = useState([]);
  const [mcpLoading, setMcpLoading] = useState(false);
  const [mcpStatusMessage, setMcpStatusMessage] = useState(null);
  const [showAddMcp, setShowAddMcp] = useState(false);
  const [testingServerId, setTestingServerId] = useState(null);
  const [testResults, setTestResults] = useState({});
  const [newMcp, setNewMcp] = useState({
    name: '',
    url: '',
    transport: 'http',
    description: '',
    enabled: true
  });

  const fetchInitialData = () => {
    // 1. Fetch LLM status
    api.get('/api/settings/keys')
      .then((res) => {
        setKeyStatus(res.data);
        const validProviders = ['anthropic', 'groq', 'gemini', 'openai', 'ollama'];
        const currentProv = (res.data?.active_provider && validProviders.includes(res.data.active_provider))
          ? res.data.active_provider
          : 'groq';
        setProvider(currentProv);

        if (res.data?.active_model) {
          const provModels = res.data?.available_models?.[currentProv] || [];
          const isPreset = provModels.some(m => m.id === res.data.active_model);
          if (isPreset) {
            setSelectedModel(res.data.active_model);
            setIsCustomModel(false);
          } else {
            setCustomModel(res.data.active_model);
            setIsCustomModel(true);
          }
        } else {
          const provModels = res.data?.available_models?.[currentProv] || [];
          if (provModels.length > 0) {
            setSelectedModel(provModels[0].id);
          }
        }
      })
      .catch((err) => console.warn('[SettingsModal] Failed to fetch LLM status:', err));

    // 2. Fetch external integrations & MCP status
    api.get('/api/settings/integrations')
      .then((res) => {
        setIntegrationsData(res.data?.apis || {});
        setMcpServers(res.data?.mcp_servers || []);
      })
      .catch((err) => console.warn('[SettingsModal] Failed to fetch integrations:', err));

    // 3. Fetch custom APIs & spec guide
    api.get('/api/settings/custom-apis')
      .then((res) => {
        setCustomApis(res.data?.apis || []);
        setSpecGuide(res.data?.guide || null);
      })
      .catch((err) => console.warn('[SettingsModal] Failed to fetch custom APIs:', err));
  };

  useEffect(() => {
    if (isOpen) {
      setStatusMessage(null);
      setApiStatusMessage(null);
      setCustomStatusMessage(null);
      setMcpStatusMessage(null);
      setApiKey('');
      setCustomValidationResult(null);
      fetchInitialData();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // --- LLM Actions ---
  const handleSelectProvider = (provId) => {
    setProvider(provId);
    setStatusMessage(null);
    setIsCustomModel(false);
    const models = keyStatus?.available_models?.[provId] || [];
    if (models.length > 0) {
      setSelectedModel(models[0].id);
    }
  };

  const handleSaveLLM = async (e) => {
    e.preventDefault();
    const isConfigured = keyStatus?.providers?.[provider]?.is_configured;
    if (provider !== 'ollama' && !apiKey.trim() && !isConfigured) {
      setStatusMessage({ type: 'error', text: 'Please enter a valid API key for the selected provider.' });
      return;
    }

    const chosenModel = isCustomModel ? customModel.trim() : selectedModel;

    setLoading(true);
    setStatusMessage(null);

    try {
      const res = await api.post('/api/settings/keys', {
        provider,
        api_key: apiKey.trim(),
        model: chosenModel || undefined
      });

      setStatusMessage({ type: 'success', text: res.data?.message || 'Provider & model configuration securely saved and verified.' });
      setApiKey('');
      
      const updatedStatus = await api.get('/api/settings/keys');
      setKeyStatus(updatedStatus.data);

      if (onKeySaved) {
        onKeySaved(provider);
      }
    } catch (err) {
      const detail = err.response?.data?.detail || err.message || 'Verification failed. Please check your key.';
      setStatusMessage({ type: 'error', text: detail });
    } finally {
      setLoading(false);
    }
  };

  // --- Geospatial API Actions ---
  const handleSaveApiKey = async (serviceKey) => {
    const val = apiInputs[serviceKey];
    if (!val || !val.trim()) {
      setApiStatusMessage({ type: 'error', text: `Please enter a valid key for ${serviceKey}.` });
      return;
    }

    setApiLoading((prev) => ({ ...prev, [serviceKey]: true }));
    setApiStatusMessage(null);

    try {
      const res = await api.post('/api/settings/integrations/keys', {
        service: serviceKey,
        api_key: val.trim()
      });

      setApiStatusMessage({ type: 'success', text: res.data?.message || 'Key saved successfully.' });
      setApiInputs((prev) => ({ ...prev, [serviceKey]: '' }));

      const refresh = await api.get('/api/settings/integrations');
      setIntegrationsData(refresh.data?.apis || {});
    } catch (err) {
      const detail = err.response?.data?.detail || err.message || 'Failed to save key.';
      setApiStatusMessage({ type: 'error', text: detail });
    } finally {
      setApiLoading((prev) => ({ ...prev, [serviceKey]: false }));
    }
  };

  // --- Custom Data API Actions ---
  const handleValidateCustomEndpoint = async () => {
    if (!newCustom.url.trim()) {
      setCustomStatusMessage({ type: 'error', text: 'Endpoint URL is required for validation.' });
      return;
    }

    setValidatingCustom(true);
    setCustomValidationResult(null);
    setCustomStatusMessage(null);

    try {
      const res = await api.post('/api/settings/custom-apis/validate', {
        url: newCustom.url.trim(),
        method: newCustom.method,
        auth_type: newCustom.auth_type,
        auth_key: newCustom.auth_key?.trim() || '',
        auth_value: newCustom.auth_value?.trim() || '',
        response_format: newCustom.response_format
      });

      setCustomValidationResult(res.data);
      if (res.data?.is_valid) {
        setCustomStatusMessage({
          type: 'success',
          text: res.data.message || 'Endpoint strictly satisfies the SpatialMind format specification.'
        });
      } else {
        setCustomStatusMessage({
          type: 'error',
          text: res.data.error || 'Endpoint validation failed against format specification.'
        });
      }
    } catch (err) {
      setCustomStatusMessage({
        type: 'error',
        text: err.response?.data?.detail || err.message || 'Validation request failed.'
      });
    } finally {
      setValidatingCustom(false);
    }
  };

  const handleSaveCustomApi = async (e) => {
    e.preventDefault();
    if (!newCustom.name.trim() || !newCustom.url.trim()) {
      setCustomStatusMessage({ type: 'error', text: 'API Name and Endpoint URL are required.' });
      return;
    }

    setCustomLoading(true);
    setCustomStatusMessage(null);

    try {
      const res = await api.post('/api/settings/custom-apis', newCustom);
      setCustomStatusMessage({
        type: 'success',
        text: res.data?.message || 'Custom API registered and AI tool dynamically generated.'
      });
      setNewCustom({
        name: '',
        url: '',
        method: 'GET',
        auth_type: 'none',
        auth_key: '',
        auth_value: '',
        response_format: 'geojson_feature_collection',
        description: '',
        enabled: true
      });
      setShowAddCustom(false);
      setCustomValidationResult(null);

      const refresh = await api.get('/api/settings/custom-apis');
      setCustomApis(refresh.data?.apis || []);
    } catch (err) {
      setCustomStatusMessage({
        type: 'error',
        text: err.response?.data?.detail || err.message || 'Failed to save custom API.'
      });
    } finally {
      setCustomLoading(false);
    }
  };

  const handleToggleCustomApi = async (apiId, currentEnabled) => {
    try {
      await api.post(`/api/settings/custom-apis/${apiId}/toggle`, { enabled: !currentEnabled });
      setCustomApis((prev) => prev.map((a) => (a.id === apiId ? { ...a, enabled: !currentEnabled } : a)));
    } catch (err) {
      console.error('Failed to toggle custom API:', err);
    }
  };

  const handleDeleteCustomApi = async (apiId) => {
    try {
      await api.delete(`/api/settings/custom-apis/${apiId}`);
      setCustomApis((prev) => prev.filter((a) => a.id !== apiId));
    } catch (err) {
      console.error('Failed to delete custom API:', err);
    }
  };

  // --- MCP Server Actions ---
  const handleAddMcpServer = async (e) => {
    e.preventDefault();
    if (!newMcp.name.trim() || !newMcp.url.trim()) {
      setMcpStatusMessage({ type: 'error', text: 'Server Name and Endpoint URL are required.' });
      return;
    }

    setMcpLoading(true);
    setMcpStatusMessage(null);

    try {
      const res = await api.post('/api/settings/mcp/servers', newMcp);
      setMcpStatusMessage({ type: 'success', text: res.data?.message || 'MCP server added successfully.' });
      setNewMcp({ name: '', url: '', transport: 'http', description: '', enabled: true });
      setShowAddMcp(false);

      const refresh = await api.get('/api/settings/mcp/servers');
      setMcpServers(refresh.data || []);
    } catch (err) {
      const detail = err.response?.data?.detail || err.message || 'Failed to add MCP server.';
      setMcpStatusMessage({ type: 'error', text: detail });
    } finally {
      setMcpLoading(false);
    }
  };

  const handleToggleMcpServer = async (serverId, currentEnabled) => {
    try {
      await api.post(`/api/settings/mcp/servers/${serverId}/toggle`, { enabled: !currentEnabled });
      setMcpServers((prev) => prev.map((s) => (s.id === serverId ? { ...s, enabled: !currentEnabled } : s)));
    } catch (err) {
      console.error('Failed to toggle MCP server:', err);
    }
  };

  const handleDeleteMcpServer = async (serverId) => {
    try {
      await api.delete(`/api/settings/mcp/servers/${serverId}`);
      setMcpServers((prev) => prev.filter((s) => s.id !== serverId));
    } catch (err) {
      console.error('Failed to delete MCP server:', err);
    }
  };

  const handleTestMcpServer = async (server) => {
    setTestingServerId(server.id);
    setMcpStatusMessage(null);

    try {
      const res = await api.post('/api/settings/mcp/test', {
        url: server.url,
        transport: server.transport,
        custom_headers: server.custom_headers
      });

      setTestResults((prev) => ({ ...prev, [server.id]: res.data }));
      if (res.data?.status === 'connected') {
        setMcpStatusMessage({
          type: 'success',
          text: `Connected to ${server.name}. Discovered ${res.data.tool_count} tool(s).`
        });
      } else {
        setMcpStatusMessage({
          type: 'error',
          text: res.data?.message || 'Connection failed.'
        });
      }
    } catch (err) {
      setMcpStatusMessage({
        type: 'error',
        text: err.response?.data?.detail || err.message || 'Connection test failed.'
      });
    } finally {
      setTestingServerId(null);
    }
  };

  const providerLinks = {
    groq: { name: 'Groq Cloud', url: 'https://console.groq.com/keys', note: 'Free & Ultra-Fast (Recommended)' },
    gemini: { name: 'Google AI Studio', url: 'https://aistudio.google.com/app/apikey', note: 'Gemini Flash' },
    anthropic: { name: 'Anthropic Console', url: 'https://console.anthropic.com/settings/keys', note: 'Claude 3.5 Sonnet / Haiku' },
    openai: { name: 'OpenAI Platform', url: 'https://platform.openai.com/api-keys', note: 'GPT-4o / GPT-4o-mini' },
    ollama: { name: 'Ollama Local', url: 'https://ollama.ai', note: 'Local offline models' }
  };

  const activeProviderInfo = providerLinks[provider] || providerLinks.groq;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-fade-in">
      <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-slate-900 text-cyan-400 shadow-xs">
              <Key className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">System Settings & Data Integrations</h3>
              <p className="text-[11px] text-slate-500">Configure AI inference, standard geospatial APIs, custom feeds, and MCP servers</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-6 pt-3 border-b border-slate-100 bg-white flex-shrink-0 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('llm')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'llm'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Cpu className="h-3.5 w-3.5" />
            <span>AI Providers & Models</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('apis')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'apis'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Globe className="h-3.5 w-3.5" />
            <span>Standard APIs</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('custom')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'custom'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Code className="h-3.5 w-3.5" />
            <span>Custom Data APIs</span>
            {customApis.filter((a) => a.enabled).length > 0 && (
              <span className="text-[10px] bg-cyan-100 text-cyan-800 font-bold px-1.5 py-0.2 rounded-full">
                {customApis.filter((a) => a.enabled).length} Ready
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('mcp')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'mcp'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Server className="h-3.5 w-3.5" />
            <span>MCP Servers</span>
            {mcpServers.filter((s) => s.enabled).length > 0 && (
              <span className="text-[10px] bg-indigo-100 text-indigo-700 font-bold px-1.5 py-0.2 rounded-full">
                {mcpServers.filter((s) => s.enabled).length} Active
              </span>
            )}
          </button>
        </div>

        {/* Tab Content Container */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {/* ============================================================== */}
          {/* TAB 1: AI PROVIDERS                                            */}
          {/* ============================================================== */}
          {activeTab === 'llm' && (
            <form onSubmit={handleSaveLLM} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">
                  Select AI Reasoning Engine
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  {[
                    { id: 'groq', name: 'Groq Cloud', desc: 'Llama 3.3 / Free', badge: 'Fastest' },
                    { id: 'gemini', name: 'Google Gemini', desc: 'Flash 1.5/2.5 / Lite', badge: 'Recommended' },
                    { id: 'anthropic', name: 'Anthropic Claude', desc: 'Claude 3.5 Sonnet / Haiku', badge: 'High Accuracy' },
                    { id: 'openai', name: 'OpenAI Platform', desc: 'GPT-4o Mini / o3-mini' },
                    { id: 'ollama', name: 'Local Ollama', desc: 'Offline / Self-Hosted' },
                  ].map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => handleSelectProvider(item.id)}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        provider === item.id
                          ? 'border-indigo-600 bg-indigo-50/60 text-indigo-950 font-semibold shadow-xs ring-1 ring-indigo-500'
                          : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-xs">{item.name}</span>
                        {item.badge && (
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-700 uppercase">
                            {item.badge}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-500 block mt-0.5">{item.desc}</span>
                      {keyStatus?.providers?.[item.id]?.is_configured && (
                        <span className="text-[10px] text-emerald-600 font-mono mt-1 block truncate">
                          Active: {keyStatus.providers[item.id].masked}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Model Selection Section */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                    <Cpu className="h-3.5 w-3.5 text-indigo-600" />
                    <span>Select Model ({provider.toUpperCase()})</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsCustomModel(!isCustomModel)}
                    className="text-[11px] text-indigo-600 hover:text-indigo-800 font-medium cursor-pointer"
                  >
                    {isCustomModel ? 'Choose from Presets' : 'Custom Model Override'}
                  </button>
                </div>

                {!isCustomModel ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {(keyStatus?.available_models?.[provider] || []).map((m) => {
                      const isSelected = selectedModel === m.id;
                      return (
                        <button
                          type="button"
                          key={m.id}
                          onClick={() => setSelectedModel(m.id)}
                          className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                            isSelected
                              ? 'border-indigo-600 bg-white text-indigo-950 font-semibold shadow-xs ring-1 ring-indigo-500'
                              : 'border-slate-200 hover:border-slate-300 bg-white/70 text-slate-700'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-xs truncate">{m.name}</span>
                            {m.badge && (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-700 uppercase">
                                {m.badge}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-500 block mt-0.5 line-clamp-1">{m.desc}</span>
                          <span className="text-[9px] text-slate-400 font-mono block mt-1 truncate">{m.id}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <input
                      type="text"
                      value={customModel}
                      onChange={(e) => setCustomModel(e.target.value)}
                      placeholder={`Enter custom ${provider} model name (e.g. ${provider === 'anthropic' ? 'claude-3-7-sonnet-20250219' : provider === 'gemini' ? 'gemini-2.5-pro' : 'custom-model-id'})`}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                    />
                    <p className="text-[10px] text-slate-500">Specify any model ID accepted by the {provider} API.</p>
                  </div>
                )}
              </div>

              {provider !== 'ollama' && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-700">
                      {(activeProviderInfo?.name || provider || 'Provider').toUpperCase()} API Key
                      {keyStatus?.providers?.[provider]?.is_configured && (
                        <span className="ml-2 text-[11px] text-emerald-600 font-normal">
                          (Saved: {keyStatus.providers[provider].masked})
                        </span>
                      )}
                    </label>
                    <a
                      href={activeProviderInfo?.url || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-medium"
                    >
                      <span>Get API key</span>
                      <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  </div>

                  <div className="relative">
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder={
                        keyStatus?.providers?.[provider]?.is_configured
                          ? `Leave blank to keep current key (${keyStatus.providers[provider].masked})`
                          : `Enter your ${(activeProviderInfo?.name || provider)} key (e.g. ${provider === 'anthropic' ? 'sk-ant-api03-...' : provider === 'groq' ? 'gsk_...' : provider === 'openai' ? 'sk-...' : 'AIza...'})`
                      }
                      className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-slate-300 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-slate-50/50"
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-2.5 top-2.5 p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
              )}

              {statusMessage && (
                <div className={`p-3 rounded-xl text-xs flex items-start gap-2 ${
                  statusMessage.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-red-50 text-red-800 border border-red-200'
                }`}>
                  {statusMessage.type === 'success' ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                  )}
                  <span className="leading-relaxed">{statusMessage.text}</span>
                </div>
              )}

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-start gap-2.5 text-slate-500 text-[11px]">
                <Lock className="h-3.5 w-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  <strong>Protected Storage:</strong> Credentials are saved in your local backend environment. Plaintext keys are never logged or exposed in telemetry.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 shadow-xs transition-colors disabled:opacity-60 cursor-pointer"
                >
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                  <span>{loading ? 'Verifying Key...' : 'Save & Verify Key'}</span>
                </button>
              </div>
            </form>
          )}

          {/* ============================================================== */}
          {/* TAB 2: STANDARD GEOSPATIAL APIS                                */}
          {/* ============================================================== */}
          {activeTab === 'apis' && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-indigo-50/60 border border-indigo-100 text-xs text-indigo-900 leading-relaxed">
                Connect external geospatial telemetry providers. When configured, tools like <code>fetch_nasa_firms_hotspots</code>, <code>fetch_openaq_stations</code>, <code>fetch_openweather_telemetry</code>, and <code>fetch_mapbox_isochrone</code> are unlocked for the engine.
              </div>

              {apiStatusMessage && (
                <div className={`p-3 rounded-xl text-xs flex items-start gap-2 ${
                  apiStatusMessage.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-red-50 text-red-800 border border-red-200'
                }`}>
                  {apiStatusMessage.type === 'success' ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                  )}
                  <span className="leading-relaxed">{apiStatusMessage.text}</span>
                </div>
              )}

              <div className="space-y-3">
                {[
                  {
                    id: 'nasa_firms',
                    name: 'NASA FIRMS (Active Fire / Hotspots)',
                    desc: 'Real-time MODIS & VIIRS satellite thermal detections and Fire Radiative Power (MW).',
                    tools: ['fetch_nasa_firms_hotspots'],
                    placeholder: 'Enter NASA FIRMS Map Key'
                  },
                  {
                    id: 'openaq',
                    name: 'OpenAQ Platform (Air Quality v3)',
                    desc: 'Global continuous ground station readings (PM2.5, PM10, NO2, SO2).',
                    tools: ['fetch_openaq_stations'],
                    placeholder: 'Enter OpenAQ API Key'
                  },
                  {
                    id: 'openweather',
                    name: 'OpenWeatherMap',
                    desc: 'Live atmospheric observations, barometric pressure, wind speeds, and precipitation.',
                    tools: ['fetch_openweather_telemetry'],
                    placeholder: 'Enter OpenWeather API Key'
                  },
                  {
                    id: 'mapbox',
                    name: 'Mapbox Navigation',
                    desc: 'High-fidelity reachable travel time isochrones (5, 10, 15, 30 min) and matrix routing.',
                    tools: ['fetch_mapbox_isochrone'],
                    placeholder: 'Enter Mapbox Access Token (pk....)'
                  },
                  {
                    id: 'copernicus',
                    name: 'Copernicus CDSE',
                    desc: 'Sentinel-2 multispectral reflectance and Sentinel-3 atmospheric observation rasters.',
                    tools: ['fetch_sentinel_imagery'],
                    placeholder: 'Enter Copernicus CDSE Key'
                  }
                ].map((item) => {
                  const conf = integrationsData?.[item.id];
                  const isConf = conf?.is_configured;
                  const masked = conf?.masked_key;
                  const docUrl = conf?.doc_url;
                  const isShow = apiShowKeys[item.id];
                  const isLoadingKey = apiLoading[item.id];

                  return (
                    <div key={item.id} className="p-3.5 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-all">
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-xs font-bold text-slate-900">{item.name}</h4>
                            {isConf ? (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 flex items-center gap-1">
                                <Check className="h-2.5 w-2.5" /> Configured
                              </span>
                            ) : (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                                Not Configured
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">{item.desc}</p>
                        </div>

                        {docUrl && (
                          <a
                            href={docUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-medium flex-shrink-0"
                          >
                            <span>Get Key</span>
                            <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        )}
                      </div>

                      {isConf && (
                        <div className="text-[11px] font-mono text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg mb-2 inline-block">
                          Active Key: {masked}
                        </div>
                      )}

                      <div className="flex items-center gap-2 mt-1.5">
                        <div className="relative flex-1">
                          <input
                            type={isShow ? 'text' : 'password'}
                            value={apiInputs[item.id] || ''}
                            onChange={(e) => setApiInputs({ ...apiInputs, [item.id]: e.target.value })}
                            placeholder={item.placeholder}
                            className="w-full px-3 py-1.5 pr-8 rounded-lg border border-slate-300 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-slate-50/50"
                          />
                          <button
                            type="button"
                            onClick={() => setApiShowKeys({ ...apiShowKeys, [item.id]: !isShow })}
                            className="absolute right-2 top-2 p-0.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                          >
                            {isShow ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                          </button>
                        </div>

                        <button
                          type="button"
                          disabled={isLoadingKey || !(apiInputs[item.id] || '').trim()}
                          onClick={() => handleSaveApiKey(item.id)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 transition-colors flex items-center gap-1 cursor-pointer flex-shrink-0"
                        >
                          {isLoadingKey ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
                          <span>Save</span>
                        </button>
                      </div>

                      <div className="mt-2 flex items-center gap-1 text-[10px] text-slate-400">
                        <span>Unlocks AI Tools:</span>
                        {item.tools.map((t) => (
                          <span key={t} className="font-mono bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded">
                            `{t}`
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 3: UNIVERSAL CUSTOM DATA APIS                              */}
          {/* ============================================================== */}
          {activeTab === 'custom' && (
            <div className="space-y-4">
              {/* Integration Guide Accordion / Banner */}
              <div className="rounded-xl border border-cyan-200 bg-cyan-50/40 p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-cyan-700" />
                    <h4 className="text-xs font-bold text-cyan-950">Universal Data API Integration Specification</h4>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowSpecGuide(!showSpecGuide)}
                    className="text-xs font-semibold text-cyan-800 hover:text-cyan-950 flex items-center gap-1 cursor-pointer"
                  >
                    <span>{showSpecGuide ? 'Hide Specifications' : 'View Output Format Guide'}</span>
                    {showSpecGuide ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  </button>
                </div>

                <p className="text-[11px] text-cyan-900 leading-relaxed">
                  Any external REST endpoint can be integrated into the system. The endpoint's response payload must resolve to one of the three standard SpatialMind specifications to be ingested, converted to GeoPandas, and displayed on the map.
                </p>

                {showSpecGuide && specGuide && (
                  <div className="mt-3 pt-3 border-t border-cyan-200 space-y-3 text-xs">
                    {specGuide.formats?.map((fmt) => (
                      <div key={fmt.format_id} className="p-3 rounded-lg bg-white border border-cyan-100 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900 text-xs">{fmt.name}</span>
                          <span className="font-mono text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded">
                            {fmt.format_id}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 leading-relaxed">{fmt.description}</p>
                        <pre className="p-2 rounded bg-slate-900 text-cyan-300 font-mono text-[10px] overflow-x-auto">
                          {JSON.stringify(fmt.example, null, 2)}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Status Message */}
              {customStatusMessage && (
                <div className={`p-3 rounded-xl text-xs flex items-start gap-2 ${
                  customStatusMessage.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-red-50 text-red-800 border border-red-200'
                }`}>
                  {customStatusMessage.type === 'success' ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                  )}
                  <span className="leading-relaxed">{customStatusMessage.text}</span>
                </div>
              )}

              {/* Action Bar */}
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-900">Registered Custom Data APIs</h4>
                  <p className="text-[11px] text-slate-500">Each active API automatically registers a dynamic tool for the AI agent</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddCustom(!showAddCustom)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 shadow-xs transition-colors cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Connect Custom API</span>
                </button>
              </div>

              {/* Add Custom API Form */}
              {showAddCustom && (
                <form onSubmit={handleSaveCustomApi} className="p-4 rounded-xl border border-cyan-200 bg-cyan-50/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-900">Connect New Spatial Data API</h4>
                    <span className="text-[10px] text-slate-500 font-mono">Dynamic AI Tool Generator</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">API Display Name</label>
                      <input
                        type="text"
                        value={newCustom.name}
                        onChange={(e) => setNewCustom({ ...newCustom, name: e.target.value })}
                        placeholder="e.g. City Sensor Stream"
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs bg-white focus:ring-1 focus:ring-cyan-500"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">Expected Output Format</label>
                      <select
                        value={newCustom.response_format}
                        onChange={(e) => setNewCustom({ ...newCustom, response_format: e.target.value })}
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs bg-white focus:ring-1 focus:ring-cyan-500"
                      >
                        <option value="geojson_feature_collection">GeoJSON FeatureCollection (Vector Features)</option>
                        <option value="lat_lon_array">Record Array (Lat/Lon JSON Objects)</option>
                        <option value="raster_geotiff">Cloud-Optimized GeoTIFF (.tif reference)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[11px] font-semibold text-slate-700">Endpoint URL</label>
                      <span className="text-[10px] text-slate-400">Must return declared format</span>
                    </div>
                    <div className="flex gap-2">
                      <select
                        value={newCustom.method}
                        onChange={(e) => setNewCustom({ ...newCustom, method: e.target.value })}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-mono bg-white flex-shrink-0"
                      >
                        <option value="GET">GET</option>
                        <option value="POST">POST</option>
                      </select>
                      <input
                        type="url"
                        value={newCustom.url}
                        onChange={(e) => setNewCustom({ ...newCustom, url: e.target.value })}
                        placeholder="https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson"
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-mono bg-white focus:ring-1 focus:ring-cyan-500 flex-1"
                        required
                      />
                    </div>
                  </div>

                  {/* Authentication Configuration */}
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">Authentication</label>
                      <select
                        value={newCustom.auth_type}
                        onChange={(e) => setNewCustom({ ...newCustom, auth_type: e.target.value })}
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs bg-white focus:ring-1 focus:ring-cyan-500"
                      >
                        <option value="none">None (Public)</option>
                        <option value="bearer">Bearer Token</option>
                        <option value="header">Custom Header</option>
                        <option value="query_param">Query Parameter</option>
                      </select>
                    </div>

                    {newCustom.auth_type === 'header' && (
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">Header Name</label>
                        <input
                          type="text"
                          value={newCustom.auth_key}
                          onChange={(e) => setNewCustom({ ...newCustom, auth_key: e.target.value })}
                          placeholder="e.g. X-API-Key"
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-mono bg-white"
                        />
                      </div>
                    )}

                    {newCustom.auth_type === 'query_param' && (
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">Parameter Key</label>
                        <input
                          type="text"
                          value={newCustom.auth_key}
                          onChange={(e) => setNewCustom({ ...newCustom, auth_key: e.target.value })}
                          placeholder="e.g. apikey"
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-mono bg-white"
                        />
                      </div>
                    )}

                    {newCustom.auth_type !== 'none' && (
                      <div className={newCustom.auth_type === 'bearer' ? 'col-span-2' : ''}>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">Secret / Token Value</label>
                        <input
                          type="password"
                          value={newCustom.auth_value}
                          onChange={(e) => setNewCustom({ ...newCustom, auth_value: e.target.value })}
                          placeholder="Secret token value"
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-mono bg-white"
                        />
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Feed Description (Guides the AI on when to call this feed)</label>
                    <input
                      type="text"
                      value={newCustom.description}
                      onChange={(e) => setNewCustom({ ...newCustom, description: e.target.value })}
                      placeholder="e.g. Real-time seismic vibration telemetry, magnitude 4.5+ worldwide"
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                    />
                  </div>

                  {/* Endpoint Live Validation Drawer */}
                  {customValidationResult && (
                    <div className={`p-3 rounded-lg border text-xs space-y-1 ${
                      customValidationResult.is_valid
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                        : 'bg-red-50 border-red-200 text-red-900'
                    }`}>
                      <div className="flex items-center justify-between">
                        <span className="font-bold">
                          {customValidationResult.is_valid ? 'Validation Passed' : 'Format Validation Failed'}
                        </span>
                        {customValidationResult.feature_count !== undefined && (
                          <span className="font-mono text-[11px]">
                            {customValidationResult.feature_count} features ready
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] leading-relaxed">
                        {customValidationResult.message || customValidationResult.error}
                      </p>
                      {customValidationResult.sample_attributes?.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          <span className="text-[10px] text-slate-500 font-semibold">Attributes:</span>
                          {customValidationResult.sample_attributes.map((attr, i) => (
                            <span key={i} className="font-mono text-[10px] bg-white px-1.5 py-0.2 rounded border border-slate-200">
                              {attr}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      onClick={handleValidateCustomEndpoint}
                      disabled={validatingCustom || !newCustom.url.trim()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-100 text-cyan-900 hover:bg-cyan-200 disabled:opacity-50 transition-colors cursor-pointer"
                    >
                      {validatingCustom ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                      <span>{validatingCustom ? 'Validating against format...' : 'Validate Endpoint Format'}</span>
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => { setShowAddCustom(false); setCustomValidationResult(null); }}
                        className="px-3 py-1.5 rounded-lg text-xs text-slate-600 hover:bg-slate-100 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={customLoading}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 cursor-pointer"
                      >
                        {customLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                        <span>Register API & Tool</span>
                      </button>
                    </div>
                  </div>
                </form>
              )}

              {/* List of Custom APIs */}
              <div className="space-y-3">
                {customApis.length === 0 ? (
                  <div className="text-center py-6 text-slate-400 text-xs border border-dashed rounded-xl">
                    No custom data APIs connected yet. Click "Connect Custom API" above to integrate any REST spatial feed.
                  </div>
                ) : (
                  customApis.map((apiItem) => (
                    <div
                      key={apiItem.id}
                      className={`p-3.5 rounded-xl border transition-all ${
                        apiItem.enabled
                          ? 'border-slate-200 bg-white'
                          : 'border-slate-200 bg-slate-50/70 opacity-75'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="text-xs font-bold text-slate-900">{apiItem.name}</h4>
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-cyan-50 text-cyan-800 border border-cyan-200 uppercase">
                              {apiItem.response_format?.replace('_', ' ') || 'GeoJSON'}
                            </span>
                            <span className={`text-[10px] font-semibold px-2 py-0.2 rounded-full ${
                              apiItem.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                            }`}>
                              {apiItem.enabled ? 'Active' : 'Disabled'}
                            </span>
                          </div>

                          <p className="text-[11px] text-slate-500 font-mono mt-1 break-all">{apiItem.url}</p>
                          {apiItem.description && (
                            <p className="text-[11px] text-slate-600 mt-0.5">{apiItem.description}</p>
                          )}

                          <div className="mt-2 flex items-center gap-2 text-[10px]">
                            <span className="text-slate-400">AI Tool Callable:</span>
                            <span className="font-mono bg-slate-100 text-indigo-700 px-1.5 py-0.5 rounded font-semibold border border-slate-200">
                              `fetch_custom_{apiItem.id}` or `query_custom_data_api(api_id="{apiItem.id}")`
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => handleToggleCustomApi(apiItem.id, apiItem.enabled)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                              apiItem.enabled
                                ? 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
                                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                            }`}
                          >
                            {apiItem.enabled ? 'Disable' : 'Enable'}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteCustomApi(apiItem.id)}
                            className="p-1 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer transition-colors"
                            title="Delete Custom API"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 4: MCP SERVERS (MODEL CONTEXT PROTOCOL)                     */}
          {/* ============================================================== */}
          {activeTab === 'mcp' && (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3 p-3 rounded-xl bg-indigo-50/60 border border-indigo-100">
                <div className="text-xs text-indigo-950 leading-relaxed">
                  <strong>Model Context Protocol (MCP):</strong> Connect remote MCP servers to dynamically inject live spatial operators, seismic monitors, or satellite catalog tools directly into the AI agent's reasoning loop.
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddMcp(!showAddMcp)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 shadow-xs transition-colors flex-shrink-0 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add MCP Server</span>
                </button>
              </div>

              {mcpStatusMessage && (
                <div className={`p-3 rounded-xl text-xs flex items-start gap-2 ${
                  mcpStatusMessage.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-red-50 text-red-800 border border-red-200'
                }`}>
                  {mcpStatusMessage.type === 'success' ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                  )}
                  <span className="leading-relaxed">{mcpStatusMessage.text}</span>
                </div>
              )}

              {/* Add MCP Server Form */}
              {showAddMcp && (
                <form onSubmit={handleAddMcpServer} className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/30 space-y-3">
                  <h4 className="text-xs font-bold text-slate-900">Add New MCP Server Endpoint</h4>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">Server Name</label>
                      <input
                        type="text"
                        value={newMcp.name}
                        onChange={(e) => setNewMcp({ ...newMcp, name: e.target.value })}
                        placeholder="e.g. USGS Earth Science MCP"
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs focus:ring-1 focus:ring-indigo-500 bg-white"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">Transport Protocol</label>
                      <select
                        value={newMcp.transport}
                        onChange={(e) => setNewMcp({ ...newMcp, transport: e.target.value })}
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs focus:ring-1 focus:ring-indigo-500 bg-white"
                      >
                        <option value="http">HTTP (JSON-RPC 2.0)</option>
                        <option value="sse">SSE (Server-Sent Events)</option>
                        <option value="http_rest">HTTP REST / GeoJSON</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Endpoint URL</label>
                    <input
                      type="url"
                      value={newMcp.url}
                      onChange={(e) => setNewMcp({ ...newMcp, url: e.target.value })}
                      placeholder="e.g. http://localhost:8080/mcp or https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson"
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-mono focus:ring-1 focus:ring-indigo-500 bg-white"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Description (Optional)</label>
                    <input
                      type="text"
                      value={newMcp.description}
                      onChange={(e) => setNewMcp({ ...newMcp, description: e.target.value })}
                      placeholder="e.g. Real-time seismic activity and seismic hazard telemetry"
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs focus:ring-1 focus:ring-indigo-500 bg-white"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowAddMcp(false)}
                      className="px-3 py-1.5 rounded-lg text-xs text-slate-600 hover:bg-slate-100 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={mcpLoading}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 cursor-pointer flex items-center gap-1"
                    >
                      {mcpLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                      <span>Save Server</span>
                    </button>
                  </div>
                </form>
              )}

              {/* List of MCP Servers */}
              <div className="space-y-3">
                {mcpServers.length === 0 ? (
                  <div className="text-center py-6 text-slate-400 text-xs">
                    No MCP servers configured yet. Click "Add MCP Server" above to connect one.
                  </div>
                ) : (
                  mcpServers.map((server) => {
                    const isTesting = testingServerId === server.id;
                    const testRes = testResults[server.id];

                    return (
                      <div
                        key={server.id}
                        className={`p-3.5 rounded-xl border transition-all ${
                          server.enabled
                            ? 'border-slate-200 bg-white'
                            : 'border-slate-200 bg-slate-50/70 opacity-75'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="text-xs font-bold text-slate-900">{server.name}</h4>
                              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 uppercase">
                                {server.transport || 'HTTP'}
                              </span>
                              <span className={`text-[10px] font-semibold px-2 py-0.2 rounded-full ${
                                server.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                              }`}>
                                {server.enabled ? 'Enabled' : 'Disabled'}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 font-mono mt-1 break-all">{server.url}</p>
                            {server.description && (
                              <p className="text-[11px] text-slate-600 mt-0.5">{server.description}</p>
                            )}
                          </div>

                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              type="button"
                              onClick={() => handleToggleMcpServer(server.id, server.enabled)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                                server.enabled
                                  ? 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
                                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                              }`}
                            >
                              {server.enabled ? 'Disable' : 'Enable'}
                            </button>

                            <button
                              type="button"
                              onClick={() => handleTestMcpServer(server)}
                              disabled={isTesting}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 cursor-pointer transition-colors"
                            >
                              {isTesting ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                              <span>Test</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteMcpServer(server.id)}
                              className="p-1 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Test Result Inspection Drawer */}
                        {testRes && (
                          <div className="mt-2.5 p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs">
                            <div className="flex items-center justify-between mb-1">
                              <span className={`font-semibold ${testRes.status === 'connected' ? 'text-emerald-700' : 'text-red-700'}`}>
                                Status: {testRes.status === 'connected' ? 'Connected' : 'Connection Failed'}
                              </span>
                              <span className="text-[10px] text-slate-500 font-mono">
                                Tools: {testRes.tool_count || 0}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-600">{testRes.message}</p>
                            {testRes.tools && testRes.tools.length > 0 && (
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {testRes.tools.map((t, idx) => (
                                  <span key={idx} className="font-mono text-[10px] bg-white border border-slate-200 px-1.5 py-0.5 rounded text-indigo-700">
                                    {t.name}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between flex-shrink-0">
          <span className="text-[11px] text-slate-400">
            SpatialMind Enterprise Engine &middot; Real-time dynamic tool generation
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
