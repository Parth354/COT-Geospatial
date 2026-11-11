/**
 * Hazard Domain Color Scales & Geometry Styling
 * Perfectly aligned with HAZARD_SCALES in MapLegend.jsx
 */

export const HAZARD_COLORS = {
  flood: {
    critical: '#1e3a8a', // > 40% Inundation / Critical Risk (Deep Navy Blue)
    high: '#2563eb',     // 20% - 40% Inundation / High Risk (Vibrant Blue)
    moderate: '#60a5fa', // 5% - 20% Inundation / Moderate Risk (Light Blue)
    low: '#bfdbfe',      // < 5% Inundation / Low Risk (Soft Pale Blue)
    stroke: '#1e3a8a',
    defaultFill: '#2563eb',
  },
  fire: {
    extreme: '#7f1d1d',  // > 300 MW (Extreme Complex)
    high: '#ef4444',     // 150 - 300 MW (High Severity)
    moderate: '#f97316', // 50 - 150 MW (Moderate Severity)
    low: '#eab308',      // < 50 MW (Low Severity)
    stroke: '#7f1d1d',
    defaultFill: '#ef4444',
  },
  aqi: {
    hazardous: '#7e0023',      // > 300
    veryUnhealthy: '#8f3f97',  // 201 - 300
    unhealthy: '#ff0000',      // 151 - 200
    sensitive: '#ff7e00',      // 101 - 150
    moderate: '#ffff00',       // 51 - 100
    good: '#00e400',           // 0 - 50
    stroke: '#c2410c',
    defaultFill: '#ff7e00',
  },
  avalanche: {
    extreme: '#7f1d1d',  // Level 5
    high: '#ef4444',     // Level 4
    moderate: '#f97316', // Level 3
    low: '#10b981',      // Level 1-2
    stroke: '#0369a1',
    defaultFill: '#38bdf8',
  },
  default: {
    color: '#1d4ed8',
    fillColor: '#3b82f6',
    fillOpacity: 0.65,
    weight: 2,
  }
};

/**
 * Checks if layer name or feature properties indicate flood domain
 */
export const isFloodDomain = (layerName = '', props = {}) => {
  const name = String(layerName || '').toLowerCase();
  if (
    name.includes('flood') || 
    name.includes('inundat') || 
    name.includes('submerg') || 
    name.includes('water') || 
    name.includes('river') || 
    name.includes('drain') || 
    name.includes('basin')
  ) {
    return true;
  }
  if (
    props.flood_risk_level || 
    props.inundation_pct !== undefined || 
    props.submerged_area_km2 !== undefined || 
    props.flood_frequency || 
    props.flood_depth !== undefined
  ) {
    return true;
  }
  const nameProp = String(props.name || '').toLowerCase();
  if (nameProp.includes('flood') || nameProp.includes('yamuna') || nameProp.includes('drain')) {
    return true;
  }
  return false;
};

/**
 * Maps flood feature properties directly to the blue flood legend scale
 */
export const getFloodFeatureColor = (props = {}) => {
  // 1. Inundation percentage (>40%, 20-40%, 5-20%, <5%)
  const pct = props.inundation_pct ?? props.inundation ?? props.submerged_pct ?? props.flood_pct;
  if (typeof pct === 'number') {
    if (pct >= 40) return HAZARD_COLORS.flood.critical;
    if (pct >= 20) return HAZARD_COLORS.flood.high;
    if (pct >= 5) return HAZARD_COLORS.flood.moderate;
    return HAZARD_COLORS.flood.low;
  }

  // 2. Risk level strings ('Critical Risk', 'High Risk', 'Very High', etc.)
  const risk = String(
    props.flood_risk_level || 
    props.risk_level || 
    props.vulnerability_level || 
    props.hazard_level || 
    props.severity || 
    ''
  ).toLowerCase();

  if (risk.includes('critical') || risk.includes('very high') || risk.includes('extreme') || risk.includes('catastrophic')) {
    return HAZARD_COLORS.flood.critical;
  }
  if (risk.includes('high') || risk.includes('severe')) {
    return HAZARD_COLORS.flood.high;
  }
  if (risk.includes('moderate') || risk.includes('medium')) {
    return HAZARD_COLORS.flood.moderate;
  }
  if (risk.includes('low') || risk.includes('minor') || risk.includes('safe') || risk.includes('none')) {
    return HAZARD_COLORS.flood.low;
  }

  // 3. Flood frequency ('Annual', 'Biannual', 'Occasional', 'Rare')
  const freq = String(props.flood_frequency || '').toLowerCase();
  if (freq.includes('annual') || freq.includes('frequent') || freq.includes('constant')) {
    return HAZARD_COLORS.flood.high;
  }
  if (freq.includes('biannual') || freq.includes('occasional')) {
    return HAZARD_COLORS.flood.moderate;
  }
  if (freq.includes('rare') || freq.includes('none') || freq.includes('never')) {
    return HAZARD_COLORS.flood.low;
  }

  // 4. Submerged area km2
  const area = props.submerged_area_km2 ?? props.area_km2;
  if (typeof area === 'number' && area > 0) {
    if (area >= 3.0) return HAZARD_COLORS.flood.critical;
    if (area >= 1.5) return HAZARD_COLORS.flood.high;
    if (area >= 0.5) return HAZARD_COLORS.flood.moderate;
    return HAZARD_COLORS.flood.low;
  }

  // Default flood blue from legend
  return HAZARD_COLORS.flood.high;
};

/**
 * Returns default styling for a layer by name or category
 */
export const getDefaultLayerStyle = (layerName = '') => {
  const n = String(layerName || '').toLowerCase();
  if (
    n.includes('flood') || 
    n.includes('inundat') || 
    n.includes('submerg') || 
    n.includes('water') || 
    n.includes('river') || 
    n.includes('drain') || 
    n.includes('basin')
  ) {
    return {
      color: HAZARD_COLORS.flood.stroke,
      fillColor: HAZARD_COLORS.flood.defaultFill,
      fillOpacity: 0.65,
      weight: 2,
    };
  }
  if (n.includes('fire') || n.includes('hotspot') || n.includes('thermal') || n.includes('frp') || n.includes('wildfire')) {
    return {
      color: HAZARD_COLORS.fire.stroke,
      fillColor: HAZARD_COLORS.fire.defaultFill,
      fillOpacity: 0.65,
      weight: 2,
    };
  }
  if (n.includes('aqi') || n.includes('air') || n.includes('pollut') || n.includes('pm25') || n.includes('pm10') || n.includes('ozone')) {
    return {
      color: HAZARD_COLORS.aqi.stroke,
      fillColor: HAZARD_COLORS.aqi.defaultFill,
      fillOpacity: 0.65,
      weight: 2,
    };
  }
  if (n.includes('snow') || n.includes('avalanche') || n.includes('slope') || n.includes('elevation')) {
    return {
      color: HAZARD_COLORS.avalanche.stroke,
      fillColor: HAZARD_COLORS.avalanche.defaultFill,
      fillOpacity: 0.65,
      weight: 2,
    };
  }
  return { ...HAZARD_COLORS.default };
};
