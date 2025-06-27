import React, { useEffect, useRef } from 'react'
import {
  X,
  CheckCircle,
  AlertTriangle,
  Info,
  AlertCircle,
  Wifi,
  WifiOff,
  Upload,
  Download,
  MapPin,
  Database
} from 'lucide-react'
import { useAppContext } from '../hooks/useAppContext'

// Utility to generate safe unique IDs
const generateUniqueId = () =>
  `notification-${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`}`

// Global Set of notification keys that have been shown
const shownNotifications = new Set()

// Determine whether a notification type should allow duplicates
const allowsDuplicates = (notification) => {
  if (notification.category === 'upload' && notification.progress !== undefined) {
    return true
  }
  return false
}

// Compute a unique key for a notification
const getNotificationKey = (notification) =>
  notification.id ||
  `${notification.type}-${notification.category || 'general'}-${notification.title || notification.message}`

function NotificationSystem() {
  const { state, actions } = useAppContext()
  const activeNotifications = useRef(new Set())
  const notificationQueue = useRef([])
  const processingQueue = useRef(false)

  // Enqueue notification safely
  const enqueueNotification = (notification) => {
    if (!notification) return
    const key = getNotificationKey(notification)
    if (activeNotifications.current.has(key)) return
    notificationQueue.current.push(notification)
  }

  // Process the notification queue
  useEffect(() => {
    const processQueue = async () => {
      if (processingQueue.current || notificationQueue.current.length === 0) return

      processingQueue.current = true
      while (notificationQueue.current.length > 0) {
        const notification = notificationQueue.current.shift()
        const key = getNotificationKey(notification)
        if (!activeNotifications.current.has(key)) {
          activeNotifications.current.add(key)
          actions.addNotification(notification)
          await new Promise((r) => setTimeout(r, 100))
        }
      }
      processingQueue.current = false
    }

    processQueue()
  }, [state.notifications.length, actions])

  // Auto-remove notifications after timeout unless persistent
  useEffect(() => {
    const timers = state.notifications.map((notification) => {
      if (notification.autoRemove !== false && !notification.persistent) {
        const timeout = getTimeout(notification)
        return setTimeout(() => {
          const key = getNotificationKey(notification)
          activeNotifications.current.delete(key)
          actions.removeNotification(notification.id)
        }, timeout)
      }
      return null
    }).filter(Boolean)

    return () => timers.forEach(clearTimeout)
  }, [state.notifications, actions])

  const getTimeout = (notification) => {
    switch (notification.type) {
      case 'error':
        return notification.persistent ? 10000 : 7000
      case 'warning':
        return 6000
      case 'success':
        return notification.category === 'upload' ? 4000 : 3000
      default:
        return 5000
    }
  }

  const getIcon = (type, category) => {
    if (category) {
      switch (category) {
        case 'connection':
          return type === 'error' ? <WifiOff className="h-5 w-5 text-red-500" /> : <Wifi className="h-5 w-5 text-green-500" />
        case 'upload':
          return <Upload className="h-5 w-5 text-blue-500" />
        case 'download':
          return <Download className="h-5 w-5 text-blue-500" />
        case 'geospatial':
          return <MapPin className="h-5 w-5 text-purple-500" />
        case 'dataset':
          return <Database className="h-5 w-5 text-indigo-500" />
        default:
          break
      }
    }
    switch (type) {
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-500" />
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />
      case 'error':
        return <AlertCircle className="h-5 w-5 text-red-500" />
      default:
        return <Info className="h-5 w-5 text-blue-500" />
    }
  }

  const getStyles = (type, category, persistent) => {
    const base = 'transition-all duration-300 transform border rounded-lg p-4 shadow-lg'
    const ring = persistent ? 'ring-2 ring-opacity-50' : ''
    switch (type) {
      case 'success':
        return `bg-green-50 border-green-200 text-green-800 ${base} ${ring} ${persistent ? 'ring-green-300' : ''}`
      case 'warning':
        return `bg-yellow-50 border-yellow-200 text-yellow-800 ${base} ${ring} ${persistent ? 'ring-yellow-300' : ''}`
      case 'error':
        return `bg-red-50 border-red-200 text-red-800 ${base} ${ring} ${persistent ? 'ring-red-300' : ''}`
      default:
        return `bg-blue-50 border-blue-200 text-blue-800 ${base} ${ring} ${persistent ? 'ring-blue-300' : ''}`
    }
  }

  const handleDismiss = (notification) => {
    const key = getNotificationKey(notification)
    activeNotifications.current.delete(key)
    actions.removeNotification(notification.id)
  }

  const getPriorityOrder = (notification) => {
    const typePriority = { error: 4, warning: 3, success: 2, info: 1 }
    const categoryPriority = { connection: 10, geospatial: 8, upload: 6, dataset: 4, general: 1 }
    return (typePriority[notification.type] || 1) + (categoryPriority[notification.category] || 1)
  }

  const sortedNotifications = [...state.notifications].sort((a, b) =>
    getPriorityOrder(b) - getPriorityOrder(a)
  )

  if (!sortedNotifications.length) return null

  return (
    <div className="fixed top-4 right-4 z-[9999] space-y-3 max-w-sm">
      {sortedNotifications.map((notification, index) => (
        <div
          key={notification.id}
          className={getStyles(notification.type, notification.category, notification.persistent)}
          style={{
            animationDelay: `${index * 100}ms`,
            animation: 'slideInRight 0.3s ease-out forwards'
          }}
          role="alert"
          aria-live="assertive"
        >
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">{getIcon(notification.type, notification.category)}</div>
            <div className="flex-1 min-w-0">
              {notification.title && (
                <h4 className="font-semibold mb-1 flex items-center gap-2">
                  {notification.title}
                  {notification.category && (
                    <span className="text-xs px-2 py-1 rounded-full bg-black bg-opacity-10 uppercase tracking-wide select-none">
                      {notification.category}
                    </span>
                  )}
                </h4>
              )}
              <p className="text-sm leading-relaxed">{notification.message}</p>

              {notification.details && (
                <details className="mt-2">
                  <summary className="text-xs cursor-pointer hover:underline">View Details</summary>
                  <p className="text-xs mt-1 p-2 bg-black bg-opacity-5 rounded">{notification.details}</p>
                </details>
              )}

              {typeof notification.progress === 'number' && (
                <div className="mt-2">
                  <div className="flex justify-between text-xs mb-1">
                    <span>Progress</span>
                    <span>{notification.progress}%</span>
                  </div>
                  <div className="w-full bg-black bg-opacity-10 rounded-full h-2">
                    <div
                      className="h-2 rounded-full transition-all duration-300 bg-current opacity-60"
                      style={{ width: `${notification.progress}%` }}
                    />
                  </div>
                </div>
              )}

              {notification.action && (
                <div className="mt-3 flex gap-2 flex-wrap">
                  <button
                    onClick={notification.action.onClick}
                    className="text-sm font-medium px-3 py-1 rounded bg-current bg-opacity-10 hover:bg-opacity-20 transition-colors"
                    type="button"
                  >
                    {notification.action.label}
                  </button>
                  {notification.action.secondary && (
                    <button
                      onClick={notification.action.secondary.onClick}
                      className="text-sm px-3 py-1 rounded hover:bg-black hover:bg-opacity-5 transition-colors"
                      type="button"
                    >
                      {notification.action.secondary.label}
                    </button>
                  )}
                </div>
              )}

              {notification.timestamp && (
                <p className="text-xs opacity-60 mt-2 select-none" aria-label="Notification time">
                  {new Date(notification.timestamp).toLocaleTimeString()}
                </p>
              )}
            </div>

            {!notification.persistent && (
              <button
                onClick={() => handleDismiss(notification)}
                className="flex-shrink-0 p-1 rounded hover:bg-black hover:bg-opacity-10 transition-colors"
                aria-label="Dismiss notification"
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      ))}

      <style>{`
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  )
}

// Helper to create a generic notification
export const createNotification = (type, message, options = {}) => {
  const notification = {
    id: options.id || generateUniqueId(),
    type,
    message,
    title: options.title,
    category: options.category,
    details: options.details,
    progress: options.progress,
    action: options.action,
    autoRemove: options.autoRemove !== false,
    persistent: options.persistent || false,
    timestamp: options.timestamp || new Date().toISOString()
  }

  const key = getNotificationKey(notification)

  if (!allowsDuplicates(notification)) {
    if (shownNotifications.has(key)) {
      console.log('Skipping duplicate notification:', key)
      return null
    }
    shownNotifications.add(key)
  }

  return notification
}

// Export for clearing the registry if needed
export const clearShownNotifications = () => {
  shownNotifications.clear()
}

// Specific notifications for connection status
export const createConnectionNotification = (connected, details) => {
  return createNotification(
    connected ? 'success' : 'error',
    connected ? 'Connected to server' : 'Connection lost',
    {
      category: 'connection',
      details,
      persistent: !connected,
      id: 'connection-status'
    }
  )
}

// Upload notifications with status and optional progress or error
export const createUploadNotification = (status, filename, progress, error) => {
  const messages = {
    start: `Uploading ${filename}...`,
    progress: `Uploading ${filename}...`,
    success: `${filename} uploaded successfully`,
    error: `Failed to upload ${filename}`
  }
  return createNotification(
    status === 'error' ? 'error' : status === 'success' ? 'success' : 'info',
    messages[status] || '',
    {
      category: 'upload',
      progress: status === 'progress' ? progress : undefined,
      details: error,
      id: `upload-${filename}`
    }
  )
}

// Geospatial notifications with optional jobId
export const createGeospatialNotification = (type, message, jobId, options = {}) => {
  return createNotification(type, message, {
    ...options,
    category: 'geospatial',
    id: jobId ? `geospatial-${jobId}` : undefined
  })
}

// Dataset notifications for added, removed, or error states
export const createDatasetNotification = (action, datasetName, options = {}) => {
  const messages = {
    added: `Dataset "${datasetName}" added successfully`,
    removed: `Dataset "${datasetName}" removed`,
    error: `Failed to process dataset "${datasetName}"`
  }
  return createNotification(
    action === 'error' ? 'error' : 'success',
    messages[action] || '',
    {
      ...options,
      category: 'dataset',
      id: `dataset-${datasetName}-${action}`
    }
  )
}

export default NotificationSystem
