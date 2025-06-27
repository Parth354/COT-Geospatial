import React, { useEffect, useRef, useState, useCallback } from 'react'
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet'
import { Layers, ZoomIn, ZoomOut, Home, AlertCircle, CheckCircle, Info } from 'lucide-react'
import { useAppContext } from '../hooks/useAppContext'
import LayerControl from './LayerControl'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'

// Fix for leaflet default markers
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
})

// Notification component for toast-style alerts on top of everything
function Notifications({ notifications, onRemove }) {
  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="fixed top-4 right-4 z-[1100] flex flex-col space-y-2 max-w-xs"
      role="alert"
    >
      {notifications.map(({ id, type, message, details }) => {
        let Icon = Info
        let bg = 'bg-blue-100 text-blue-800'
        if (type === 'error') {
          Icon = AlertCircle
          bg = 'bg-red-100 text-red-800'
        } else if (type === 'success') {
          Icon = CheckCircle
          bg = 'bg-green-100 text-green-800'
        }
        return (
          <div
            key={id}
            className={`${bg} rounded-md shadow-md p-3 flex items-start space-x-2`}
          >
            <Icon className="flex-shrink-0 w-6 h-6" aria-hidden="true" />
            <div className="flex-1 text-sm">
              <p>{message}</p>
              {details && <p className="mt-1 text-xs opacity-75">{details}</p>}
            </div>
            <button
              onClick={() => onRemove(id)}
              aria-label="Dismiss notification"
              className="ml-2 text-current opacity-50 hover:opacity-75"
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}

// Component to fit bounds on layer changes
function MapController() {
  const map = useMap()
  const { state } = useAppContext()

  useEffect(() => {
    if (state.mapLayers.length > 0) {
      const group = new L.featureGroup()
      state.mapLayers.forEach(layer => {
        if (layer.data && layer.data.features) {
          const geoJsonLayer = L.geoJSON(layer.data)
          group.addLayer(geoJsonLayer)
        }
      })
      if (group.getLayers().length > 0) {
        map.fitBounds(group.getBounds(), { padding: [20, 20] })
      }
    }
  }, [state.mapLayers, map])

  return null
}

function MapViewer() {
  const { state } = useAppContext()
  const mapRef = useRef(null)

  // Notification state: {id, type, message, details}
  const [notifications, setNotifications] = useState([])

  // Helper: Add a notification, auto-remove after 8 seconds
  const addNotification = useCallback((notif) => {
    const id = `${Date.now()}-${Math.random()}`
    setNotifications((n) => [...n, { ...notif, id }])
    setTimeout(() => {
      setNotifications((n) => n.filter((item) => item.id !== id))
    }, 8000)
  }, [])

  // Remove notification manually
  const removeNotification = (id) => {
    setNotifications((n) => n.filter((item) => item.id !== id))
  }

  // Show notifications only for errors that are not connection errors
  useEffect(() => {
    if (state.error) {
      if (
        !state.error.message?.toLowerCase().includes('websocket') &&
        !state.error.message?.toLowerCase().includes('connection')
      ) {
        addNotification({
          type: 'error',
          message: `Error: ${state.error.message || 'Unknown error'}`,
          details: state.error.details,
        })
      }
    }
    if (state.loading) {
      addNotification({
        type: 'info',
        message: 'Processing geospatial analysis...',
      })
    }
  }, [state.error, state.loading, addNotification])

  const getLayerStyle = (layerType) => {
    const styles = {
      'flood-zones': {
        fillColor: '#ef4444',
        fillOpacity: 0.6,
        color: '#dc2626',
        weight: 2,
      },
      'flood-high-risk': {
        fillColor: '#dc2626',
        fillOpacity: 0.8,
        color: '#991b1b',
        weight: 2,
      },
      'flood-medium-risk': {
        fillColor: '#f59e0b',
        fillOpacity: 0.6,
        color: '#d97706',
        weight: 2,
      },
      'flood-low-risk': {
        fillColor: '#fbbf24',
        fillOpacity: 0.4,
        color: '#f59e0b',
        weight: 2,
      },
      hospitals: {
        fillColor: '#22c55e',
        fillOpacity: 0.7,
        color: '#16a34a',
        weight: 2,
      },
      roads: {
        color: '#6b7280',
        weight: 3,
        opacity: 0.8,
      },
      boundaries: {
        fillColor: 'transparent',
        color: '#374151',
        weight: 2,
        dashArray: '5, 5',
      },
      default: {
        fillColor: '#3b82f6',
        fillOpacity: 0.5,
        color: '#2563eb',
        weight: 2,
      },
    }
    return styles[layerType] || styles.default
  }

  const onEachFeature = (feature, layer) => {
    if (feature.properties) {
      const popupContent = Object.entries(feature.properties)
        .map(([key, value]) => `<strong>${key}:</strong> ${value}`)
        .join('<br>')
      layer.bindPopup(popupContent)
    }
  }

  const handleZoomIn = () => {
    if (mapRef.current) {
      mapRef.current.zoomIn()
    }
  }

  const handleZoomOut = () => {
    if (mapRef.current) {
      mapRef.current.zoomOut()
    }
  }

  const handleResetView = () => {
    if (mapRef.current) {
      mapRef.current.setView(state.mapCenter, state.mapZoom)
    }
  }

  return (
    <div className="relative h-full">
      <Notifications notifications={notifications} onRemove={removeNotification} />

      <div className="absolute top-4 left-4 space-y-2 z-[1050]">
        <div className="bg-white rounded-lg shadow-lg p-2 space-y-1">
          <button
            onClick={handleZoomIn}
            className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded focus:outline-none focus:ring-2 focus:ring-primary-500"
            title="Zoom In"
            aria-label="Zoom In"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            onClick={handleZoomOut}
            className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded focus:outline-none focus:ring-2 focus:ring-primary-500"
            title="Zoom Out"
            aria-label="Zoom Out"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            onClick={handleResetView}
            className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded focus:outline-none focus:ring-2 focus:ring-primary-500"
            title="Reset View"
            aria-label="Reset View"
          >
            <Home className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="absolute top-4 right-4 z-[1050]">
        <LayerControl />
      </div>

      <MapContainer
        center={state.mapCenter}
        zoom={state.mapZoom}
        style={{ height: '100%', width: '100%' }}
        ref={mapRef}
        zoomControl={false}
      >
        <MapController />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {state.mapLayers.map(
          (layer) =>
            layer.visible &&
            layer.data && (
              <GeoJSON
                key={layer.id}
                data={layer.data}
                style={getLayerStyle(layer.type)}
                onEachFeature={onEachFeature}
              />
            )
        )}
      </MapContainer>

      {state.loading && notifications.length === 0 && (
        <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center z-[1040]">
          <div className="bg-white rounded-lg shadow-lg p-6 flex items-center space-x-3">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
            <span className="text-gray-700">Processing geospatial analysis...</span>
          </div>
        </div>
      )}

      {state.mapLayers.length === 0 && !state.loading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[1030]">
          <div className="text-center text-gray-500">
            <Layers className="h-16 w-16 mx-auto mb-4 text-gray-300" />
            <p className="text-lg font-medium">No Data to Display</p>
            <p className="text-sm">Upload data or submit a query to see results on the map</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default MapViewer
