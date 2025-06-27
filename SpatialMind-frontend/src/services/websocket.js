// ✅ Updated WebSocketService: Leave channel only AFTER job is complete

import { v4 as uuidv4 } from 'uuid'
import { store } from '../hooks/store'

class WebSocketService {
  constructor() {
    this.socket = null
    this.isConnected = false
    this.isConnecting = false
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 5
    this.reconnectDelay = 1000
    this.currentJobId = null
    this.hasShownError = false
    this.hasShownJobComplete = new Set()
    this.hasShownConnectedNotification = false
    this.externalMessageHandler = null
    this.pendingJoinRequests = []
  }

  connect() {
    if (this.socket && this.isConnected) {
      return Promise.resolve()
    }

    if (this.isConnecting) {
      return Promise.resolve()
    }

    this.isConnecting = true
    const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws'
    console.log('🔌 Connecting to WebSocket:', WS_URL)

    return new Promise((resolve, reject) => {
      this.socket = new WebSocket(WS_URL)

      this.socket.onopen = () => {
        console.log('✅ WebSocket connected successfully')
        this.isConnected = true
        this.isConnecting = false
        this.reconnectAttempts = 0
        this.hasShownError = false
        store.actions.setWebSocketConnected(true)

        if (!this.hasShownConnectedNotification) {
          store.actions.addNotification({
            type: 'success',
            message: 'Connected to server',
            timeout: 3000
          })
          this.hasShownConnectedNotification = true
        }

        this.processPendingJoinRequests()
        resolve()
      }

      this.socket.onclose = (event) => {
        console.log(`⚠️ WebSocket disconnected [${event.code}] ${event.reason || ''}`)
        this.isConnected = false
        this.isConnecting = false
        store.actions.setWebSocketConnected(false)

        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++
          const delay = this.reconnectDelay * this.reconnectAttempts
          console.log(`🔄 Reconnecting in ${delay}ms... (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`)
          setTimeout(() => {
            this.connect()
          }, delay)
        } else {
          if (!this.hasShownError) {
            store.actions.addNotification({
              type: 'error',
              message: 'Could not reconnect to server after multiple attempts.',
              timeout: 5000
            })
            this.hasShownError = true
          }
        }
      }

      this.socket.onerror = (error) => {
        console.error('❌ WebSocket error:', error)
        this.isConnected = false
        this.isConnecting = false
        store.actions.setWebSocketConnected(false)

        if (!this.hasShownError) {
          store.actions.addNotification({
            type: 'error',
            message: 'WebSocket connection error',
            timeout: 5000
          })
          this.hasShownError = true
        }
        resolve()
      }

      this.socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          console.log('📥 WebSocket message received:', message)
          this.handleMessage(message)
        } catch (err) {
          console.error('❌ Error parsing WebSocket message:', err, 'Raw data:', event.data)
        }
      }

      setTimeout(() => {
        if (this.isConnecting) {
          console.warn('⏰ WebSocket connection timeout')
          this.socket.close()
          reject(new Error('Connection timeout'))
        }
      }, 10000)
    })
  }

  handleMessage(message) {
    console.log('📨 Processing WebSocket message:', message)

    if (this.externalMessageHandler) {
      this.externalMessageHandler(message)
    }

    switch (message.type) {
      case 'cot_step':
        console.log('🧠 Chain-of-thought step:', message)
        store.actions.addCotStep({
          id: uuidv4(),
          jobId: message.job_id,
          stepNumber: message.step_number,
          stepType: message.step_type,
          content: message.content,
          timestamp: message.timestamp || new Date().toISOString()
        })
        break

      case 'tool_execution':
        console.log('🔧 Tool execution:', message)
        store.actions.addCotStep({
          id: uuidv4(),
          jobId: message.job_id,
          stepType: 'tool_execution',
          content: `${message.tool}: ${message.message} (${message.progress}%)`,
          progress: message.progress,
          timestamp: new Date().toISOString()
        })
        break

      case 'job_complete':
        console.log('✅ Job complete:', message)
        if (!this.hasShownJobComplete.has(message.job_id)) {
          store.actions.updateJobStatus('completed')
          store.actions.addNotification({
            type: 'success',
            title: 'Analysis Complete',
            message: 'Your geospatial analysis has finished.',
            timeout: 5000
          })
          this.hasShownJobComplete.add(message.job_id)

          // ✅ Now leave channel only after job is complete
          this.leaveChannel(message.job_id)
        } else {
          console.log(`ℹ️ Job complete notification already shown for job ${message.job_id}`)
        }
        break

      case 'error':
        console.error('❌ Job error:', message)
        store.actions.setError(`${message.error_code}: ${message.message}`)
        if (message.details) {
          console.error('Error details:', message.details)
        }
        break

      default:
        console.warn('❓ Unknown message type:', message.type, message)
    }
  }

  joinChannel(jobId) {
    console.log(`🔗 Attempting to join channel for job: ${jobId}`)

    if (!jobId) {
      console.error('❌ Cannot join channel: jobId is null/undefined')
      return
    }

    if (!this.socket || !this.isConnected) {
      console.warn('⏳ WebSocket not connected. Queueing join request for:', jobId)
      this.pendingJoinRequests.push(jobId)
      return
    }

    if (this.currentJobId === jobId) {
      console.log(`ℹ️ Already joined channel for job ${jobId}`)
      return
    }

    if (this.currentJobId) {
      this.leaveChannel(this.currentJobId)
    }

    this.currentJobId = jobId
    this.hasShownJobComplete.delete(jobId)

    const joinMessage = {
      type: 'join_channel',
      job_id: jobId
    }

    console.log('📤 Sending join_channel message:', joinMessage)
    this.safeSend(joinMessage)
  }

  processPendingJoinRequests() {
    console.log(`📋 Processing ${this.pendingJoinRequests.length} pending join requests`)
    while (this.pendingJoinRequests.length > 0) {
      const jobId = this.pendingJoinRequests.shift()
      this.joinChannel(jobId)
    }
  }

  leaveChannel(jobId) {
    if (!this.socket || !this.isConnected) {
      console.warn('⚠️ WebSocket not connected. Cannot leave channel.')
      return
    }

    if (this.currentJobId !== jobId) {
      console.log(`ℹ️ Not connected to channel for job ${jobId}. Nothing to leave.`)
      return
    }

    this.safeSend({
      type: 'leave_channel',
      job_id: jobId
    })
    console.log(`👋 Left WebSocket channel for job ${jobId}`)
    this.currentJobId = null
  }

  disconnect() {
    if (this.socket) {
      console.log('🛑 Manually disconnecting WebSocket')
      this.socket.close()
      this.socket = null
      this.isConnected = false
      this.isConnecting = false
      this.currentJobId = null
      this.pendingJoinRequests = []
      store.actions.setWebSocketConnected(false)
      this.hasShownError = false
      this.hasShownConnectedNotification = false
    }
  }

  safeSend(message) {
    if (this.socket && this.isConnected) {
      try {
        const jsonMessage = JSON.stringify(message)
        console.log('📤 Sending WebSocket message:', jsonMessage)
        this.socket.send(jsonMessage)
      } catch (error) {
        console.error('❌ Error sending WebSocket message:', error)
      }
    } else {
      console.warn('⚠️ WebSocket not connected, cannot send message:', message)
    }
  }

  setExternalMessageHandler(handler) {
    console.log('🔧 Setting external message handler')
    this.externalMessageHandler = handler
  }

  getStatus() {
    return {
      isConnected: this.isConnected,
      isConnecting: this.isConnecting,
      currentJobId: this.currentJobId,
      reconnectAttempts: this.reconnectAttempts,
      pendingJoinRequests: this.pendingJoinRequests.length
    }
  }
}

const webSocketService = new WebSocketService()
webSocketService.connect().catch(err => {
  console.error('Failed to auto-connect WebSocket:', err)
})

export default webSocketService