import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Layers, Info } from 'lucide-react';
import { useAppContext } from '../hooks/AppContext';

const HAZARD_SCALES = {
  aqi: {
    title: 'Air Quality (US EPA AQI)',
    subtitle: 'Daily Peak & Interpolated Surface',
    items: [
      { range: '0 - 50', label: 'Good', color: '#00e400' },
      { range: '51 - 100', label: 'Moderate', color: '#ffff00' },
      { range: '101 - 150', label: 'Unhealthy for Sensitive', color: '#ff7e00' },
      { range: '151 - 200', label: 'Unhealthy', color: '#ff0000' },
      { range: '201 - 300', label: 'Very Unhealthy', color: '#8f3f97' },
      { range: '> 300', label: 'Hazardous', color: '#7e0023' },
    ],
  },
  flood: {
    title: 'Flood Vulnerability',
    subtitle: 'Urban Inundation Extent',
    items: [
      { range: '> 40%', label: 'Critical Risk', color: '#1e3a8a' },
      { range: '20% - 40%', label: 'High Risk', color: '#2563eb' },
      { range: '5% - 20%', label: 'Moderate Risk', color: '#60a5fa' },
      { range: '< 5%', label: 'Low Risk', color: '#bfdbfe' },
    ],
  },
  fire: {
    title: 'Wildfire Fire Radiative Power',
    subtitle: 'Cluster Radiative Energy (MW)',
    items: [
      { range: '> 300 MW', label: 'Extreme Complex', color: '#7f1d1d' },
      { range: '150 - 300 MW', label: 'High Severity', color: '#ef4444' },
      { range: '50 - 150 MW', label: 'Moderate Severity', color: '#f97316' },
      { range: '< 50 MW', label: 'Low Severity', color: '#eab308' },
    ],
  },
  avalanche: {
    title: 'Avalanche Hazard Index',
    subtitle: 'Slope & Thermal Corridor Risk',
    items: [
      { range: 'Level 5', label: 'Extreme Hazard', color: '#7f1d1d' },
      { range: 'Level 4', label: 'High Hazard', color: '#ef4444' },
      { range: 'Level 3', label: 'Moderate Risk', color: '#f97316' },
      { range: 'Level 1-2', label: 'Low Risk', color: '#10b981' },
    ],
  },
};

export default function MapLegend() {
  const { state } = useAppContext();
  const { mapLayers = [] } = state;
  const [isOpen, setIsOpen] = useState(true);
  const [activeTab, setActiveTab] = useState('aqi');

  // Auto-detect relevant hazard based on visible layers (prioritizing most recently added)
  useEffect(() => {
    const visibleLayers = mapLayers.filter((l) => l.visible);
    for (let i = visibleLayers.length - 1; i >= 0; i--) {
      const n = (visibleLayers[i].name || '').toLowerCase();
      if (n.includes('flood') || n.includes('inundat') || n.includes('submerged') || n.includes('water') || n.includes('river')) {
        setActiveTab('flood');
        return;
      }
      if (n.includes('fire') || n.includes('hotspot') || n.includes('frp') || n.includes('wildfire')) {
        setActiveTab('fire');
        return;
      }
      if (n.includes('aqi') || n.includes('pollut') || n.includes('forecast') || n.includes('air') || n.includes('pm25')) {
        setActiveTab('aqi');
        return;
      }
      if (n.includes('snow') || n.includes('avalanche')) {
        setActiveTab('avalanche');
        return;
      }
    }
  }, [mapLayers]);

  const activeScale = HAZARD_SCALES[activeTab] || HAZARD_SCALES.aqi;

  return (
    <div className="absolute bottom-6 right-4 z-[1000] bg-white/95 backdrop-blur-sm rounded-lg shadow-xl border border-gray-200 w-72 text-gray-800 transition-all text-xs font-sans">
      {/* Header */}
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between px-3 py-2 cursor-pointer select-none bg-gray-50/90 rounded-t-lg border-b border-gray-100 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-1.5 font-semibold text-gray-700">
          <Layers className="h-3.5 w-3.5 text-blue-600" />
          <span>GIS Map Legend</span>
        </div>
        <button 
          className="text-gray-400 hover:text-gray-600 p-0.5 rounded"
          title={isOpen ? "Collapse Legend" : "Expand Legend"}
        >
          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>
      </div>

      {isOpen && (
        <div className="p-2.5 space-y-2">
          {/* Domain tabs */}
          <div className="flex gap-1 border-b border-gray-100 pb-1.5">
            {[
              { id: 'aqi', label: 'Air AQI' },
              { id: 'flood', label: 'Flood' },
              { id: 'fire', label: 'Fire FRP' },
              { id: 'avalanche', label: 'Avalanche' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-2 py-0.5 text-[11px] rounded font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Active Scale Description */}
          <div className="px-1">
            <div className="font-semibold text-gray-800 text-[11.5px]">{activeScale.title}</div>
            <div className="text-[10px] text-gray-500">{activeScale.subtitle}</div>
          </div>

          {/* Color Ramp List */}
          <div className="space-y-1 pt-0.5">
            {activeScale.items.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between px-1.5 py-0.5 rounded hover:bg-gray-50">
                <div className="flex items-center gap-2">
                  <span
                    className="w-3.5 h-3.5 rounded-sm shadow-xs border border-black/10 flex-shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-gray-700 font-medium text-[11px]">{item.label}</span>
                </div>
                <span className="text-[10px] text-gray-500 font-mono">{item.range}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
