import React, { useState, useEffect } from 'react';
import {
  X, Key, ShieldCheck, CheckCircle2, AlertCircle, Loader2, Eye, EyeOff,
  Cpu, ExternalLink, Lock, Globe, Server, Plus, Trash2, RefreshCw, Check
} from 'lucide-react';
import { api } from '../api/api.js';

export const SettingsModal = ({ isOpen, onClose, onKeySaved }) => {
  const [activeTab, setActiveTab] = useState('llm'); // 'llm' | 'apis' | 'mcp'

  // LLM State
  const [provider, setProvider] = useState('groq');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const [keyStatus, setKeyStatus] = useState(null);

  // Geospatial APIs State
  const [integrationsData, setIntegrationsData] = useState(null);
  const [apiInputs, setApiInputs] = useState({});
  const [apiShowKeys, setApiShowKeys] = useState({});
  const [apiLoading, setApiLoading] = useState({});
  const [apiStatusMessage, setApiStatusMessage] = useState(null);

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
        const validProviders = ['groq', 'gemini', 'openai', 'ollama'];
        if (res.data?.active_provider && validProviders.includes(res.data.active_provider)) {
          setProvider(res.data.active_provider);
        } else {
          setProvider('groq');
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
  };

  useEffect(() => {
    if (isOpen) {
      setStatusMessage(null);
      setApiStatusMessage(null);
      setMcpStatusMessage(null);
      setApiKey('');
      fetchInitialData();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // --- LLM Actions ---
  const handleSaveLLM = async (e) => {
    e.preventDefault();
    if (provider !== 'ollama' && !apiKey.trim()) {
      setStatusMessage({ type: 'error', text: 'Please enter a valid API key for the selected provider.' });
      return;
    }

    setLoading(true);
    setStatusMessage(null);

    try {
      const res = await api.post('/api/settings/keys', {
        provider,
        api_key: apiKey.trim()
      });

      setStatusMessage({ type: 'success', text: res.data?.message || 'API key securely saved and verified.' });
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

      // Refresh integrations data
      const refresh = await api.get('/api/settings/integrations');
      setIntegrationsData(refresh.data?.apis || {});
    } catch (err) {
      const detail = err.response?.data?.detail || err.message || 'Failed to save key.';
      setApiStatusMessage({ type: 'error', text: detail });
    } finally {
      setApiLoading((prev) => ({ ...prev, [serviceKey]: false }));
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
    openai: { name: 'OpenAI Platform', url: 'https://platform.openai.com/api-keys', note: 'GPT-4o / GPT-4o-mini' },
    ollama: { name: 'Ollama Local', url: 'https://ollama.ai', note: 'Local offline models' }
  };

  const activeProviderInfo = providerLinks[provider] || providerLinks.groq;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-fade-in">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-600 text-white shadow-xs">
              <Key className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">System Settings & Integrations</h3>
              <p className="text-[11px] text-slate-500">Configure AI models, external geospatial APIs, and MCP servers</p>
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
        <div className="flex items-center gap-1 px-6 pt-3 border-b border-slate-100 bg-white flex-shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('llm')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
              activeTab === 'llm'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Cpu className="h-3.5 w-3.5" />
            <span>AI Providers</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('apis')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
              activeTab === 'apis'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Globe className="h-3.5 w-3.5" />
            <span>Geospatial APIs</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('mcp')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
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
                  Select AI Reasoning Provider
                </label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    { id: 'groq', name: 'Groq Cloud', desc: 'Free & Ultra-Fast', badge: 'Recommended' },
                    { id: 'gemini', name: 'Google Gemini', desc: 'Flash 1.5/2.0' },
                    { id: 'openai', name: 'OpenAI Platform', desc: 'GPT-4o Mini' },
                    { id: 'ollama', name: 'Local Ollama', desc: 'Offline / Free' },
                  ].map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => { setProvider(item.id); setStatusMessage(null); }}
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
                        <span className="text-[10px] text-emerald-600 font-mono mt-1 block">
                          Active: {keyStatus.providers[item.id].masked}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {provider !== 'ollama' && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-700">
                      {(activeProviderInfo?.name || provider || 'Provider').toUpperCase()} API Key
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
                      placeholder={`Enter your ${(activeProviderInfo?.name || provider)} key (e.g. ${provider === 'groq' ? 'gsk_...' : provider === 'openai' ? 'sk-...' : 'AIza...'})`}
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
                  <strong>Secure Storage:</strong> Credentials are verified and saved directly into your protected local backend configuration. Plaintext keys are never logged or exposed.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-xs transition-colors disabled:opacity-60 cursor-pointer"
                >
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                  <span>{loading ? 'Verifying Key...' : 'Save & Verify Key'}</span>
                </button>
              </div>
            </form>
          )}

          {/* ============================================================== */}
          {/* TAB 2: GEOSPATIAL APIS                                         */}
          {/* ============================================================== */}
          {activeTab === 'apis' && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-indigo-50/60 border border-indigo-100 text-xs text-indigo-900 leading-relaxed">
                Connect external geospatial telemetry providers. When configured, the AI agent can autonomously invoke tools like <code>fetch_nasa_firms_hotspots</code>, <code>fetch_openaq_stations</code>, <code>fetch_openweather_telemetry</code>, and <code>fetch_mapbox_isochrone</code>.
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
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center gap-1 cursor-pointer flex-shrink-0"
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
          {/* TAB 3: MCP SERVERS (MODEL CONTEXT PROTOCOL)                     */}
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
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-xs transition-colors flex-shrink-0 cursor-pointer"
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
                      className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 cursor-pointer flex items-center gap-1"
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
                            {/* Toggle Button */}
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

                            {/* Test Connection Button */}
                            <button
                              type="button"
                              onClick={() => handleTestMcpServer(server)}
                              disabled={isTesting}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 cursor-pointer transition-colors"
                            >
                              {isTesting ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                              <span>Test</span>
                            </button>

                            {/* Delete Button */}
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
            SpatialMind Intelligence Hub &middot; Zero telemetry leakage
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
