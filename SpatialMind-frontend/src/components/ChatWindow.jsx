import React, { useState, useEffect, useRef } from 'react'
import {
  Send, Brain, User, Bot, MessageSquare, Clock, AlertTriangle
} from 'lucide-react'
import webSocketService from '../services/websocket'
import { queryAPI } from '../services/api'

function ChatWindow() {
  const [isWebSocketConnected, setIsWebSocketConnected] = useState(false)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const [currentJobId, setCurrentJobId] = useState(null)
  const [sessionId, setSessionId] = useState(null)
  const [inputMessage, setInputMessage] = useState('')
  const messagesEndRef = useRef(null)
  const connectionAttemptRef = useRef(0)
  const reconnectTimeoutRef = useRef(null)

  useEffect(() => {
    let isMounted = true

    const connectWebSocket = async () => {
      if (!isMounted) return

      console.log('🔄 ChatWindow: Attempting WebSocket connection...')
      connectionAttemptRef.current += 1

      try {
        await webSocketService.connect()

        if (!isMounted) return

        setIsWebSocketConnected(true)
        connectionAttemptRef.current = 0
        
        console.log('✅ ChatWindow: WebSocket connected successfully')
      } catch (error) {
        console.error('❌ ChatWindow: WebSocket connection failed:', error)
        if (isMounted) {
          setIsWebSocketConnected(false)
          scheduleReconnect()
        }
      }
    }

    const scheduleReconnect = () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      const delay = Math.min(1000 * Math.pow(2, Math.min(connectionAttemptRef.current, 5)), 30000)
      console.log(`🔄 ChatWindow: Scheduling reconnect in ${delay}ms (attempt ${connectionAttemptRef.current + 1})`)

      reconnectTimeoutRef.current = setTimeout(() => {
        if (isMounted && !isWebSocketConnected) {
          connectWebSocket()
        }
      }, delay)
    }

    // Set up message handler for ChatWindow
    webSocketService.setExternalMessageHandler((msg) => {
      console.log('💬 ChatWindow: Message received:', msg)
      
      switch (msg.type) {
        case 'cot_step':
          setMessages(prev => [
            ...prev,
            {
              id: `${msg.job_id}-${msg.step_number}-${Date.now()}`,
              type: 'assistant',
              content: `🧠 ${msg.content}`,
              timestamp: msg.timestamp || new Date().toISOString(),
              jobId: msg.job_id
            }
          ])
          break

        case 'tool_execution':
          setMessages(prev => [
            ...prev,
            {
              id: `${msg.job_id}-tool-${Date.now()}`,
              type: 'assistant',
              content: `🔧 ${msg.tool}: ${msg.message} ${msg.progress ? `(${msg.progress}%)` : ''}`,
              timestamp: new Date().toISOString(),
              jobId: msg.job_id,
              progress: msg.progress
            }
          ])
          break

        case 'job_complete':
          setMessages(prev => [
            ...prev,
            {
              id: `${msg.job_id}-complete-${Date.now()}`,
              type: 'assistant',
              content: '✅ Analysis Complete! Your geospatial analysis has finished.',
              timestamp: new Date().toISOString(),
              jobId: msg.job_id
            }
          ])
          setCurrentJobId(null)
          setLoading(false)
          break

        case 'error':
          setMessages(prev => [
            ...prev,
            {
              id: `${msg.job_id}-error-${Date.now()}`,
              type: 'assistant',
              content: `❌ Error: ${msg.error_code}: ${msg.message}`,
              timestamp: new Date().toISOString(),
              jobId: msg.job_id
            }
          ])
          setCurrentJobId(null)
          setLoading(false)
          break

        default:
          console.log('❓ ChatWindow: Unknown message type:', msg.type)
      }
    })

    // Start connection
    connectWebSocket()

    return () => {
      console.log('🧹 ChatWindow: Cleanup...')
      isMounted = false
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      // Don't disconnect here - let the service manage its own lifecycle
    }
  }, [])

  // Monitor WebSocket connection status
  useEffect(() => {
    const checkConnection = () => {
      const status = webSocketService.getStatus()
      setIsWebSocketConnected(status.isConnected)
    }

    const interval = setInterval(checkConnection, 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!inputMessage.trim() || loading) return

    // Don't require WebSocket connection to submit - the backend will queue messages
    const userMsg = {
      id: `user-${Date.now()}`,
      type: 'user',
      content: inputMessage.trim(),
      timestamp: new Date().toISOString()
    }

    setMessages(prev => [...prev, userMsg])
    setLoading(true)
    const originalInput = inputMessage.trim()
    setInputMessage('')

    try {
      // Generate session ID if needed
      const currentSessionId = sessionId || genSession()
      
      const context = {
        uploadedDatasets: [],
        currentMapBounds: null
      }

      console.log('📤 Submitting query:', originalInput)
      
      const data = await queryAPI.submitQuery(
        originalInput,
        currentSessionId,
        context
      )

      console.log('✅ Query response:', data)
      setCurrentJobId(data.jobId)

      // Ensure WebSocket is connected before joining channel
      if (!webSocketService.getStatus().isConnected) {
        console.log('🔄 WebSocket not connected, attempting to connect...')
        await webSocketService.connect()
      }

      // Join the channel for this job
      webSocketService.joinChannel(data.jobId)

      const assistantMsg = {
        id: `assistant-${data.jobId}-start`,
        type: 'assistant',
        content: `🛰️ Processing your request... ETA: ${data.estimatedTime}`,
        timestamp: new Date().toISOString(),
        jobId: data.jobId
      }

      setMessages(prev => [...prev, assistantMsg])

    } catch (err) {
      console.error('❌ Error submitting query:', err)
      setMessages(prev => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          type: 'assistant',
          content: `❌ Error submitting query: ${err.message}`,
          timestamp: new Date().toISOString()
        }
      ])
      setLoading(false)
    }
  }

  const genSession = () => {
    const id = `session-${Date.now()}-${Math.random().toString(36).slice(2)}`
    setSessionId(id)
    console.log('🆔 Generated session ID:', id)
    return id
  }

  const renderMsg = (m) => (
    <div key={m.id} className={`flex ${m.type === 'user' ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className={`flex items-end gap-2 max-w-[75%] ${m.type === 'user' ? 'flex-row-reverse' : ''}`}>
        <div className="flex-shrink-0">
          {m.type === 'user' ? (
            <User className="h-6 w-6 text-blue-600" />
          ) : (
            <Bot className="h-6 w-6 text-green-600" />
          )}
        </div>
        <div className={`relative p-3 rounded-2xl text-sm shadow ${
          m.type === 'user'
            ? 'bg-blue-600 text-white'
            : 'bg-gray-100 text-gray-800'
        }`}>
          <p className="whitespace-pre-wrap break-words">{m.content}</p>
          {m.progress && (
            <div className="mt-2 bg-white bg-opacity-20 rounded-full h-2">
              <div 
                className="bg-green-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${m.progress}%` }}
              />
            </div>
          )}
          <span className={`absolute bottom-0 ${
            m.type === 'user' ? 'right-2' : 'left-2'
          } w-3 h-3 transform translate-y-1 rotate-45 ${
            m.type === 'user' ? 'bg-blue-600' : 'bg-gray-100'
          }`} />
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <header className="p-4 bg-white border-b flex justify-between items-center">
        <h2 className="flex items-center text-lg font-semibold text-gray-900 gap-2">
          <MessageSquare className="h-5 w-5" /> GeoSpatial AI Chat
        </h2>
        <div className="flex items-center gap-4">
          {messages.length > 0 && (
            <button
              onClick={() => {
                setMessages([])
                setCurrentJobId(null)
                setLoading(false)
              }}
              className="text-xs text-gray-600 border border-gray-300 px-2 py-1 rounded hover:bg-gray-100"
            >
              Clear Chat
            </button>
          )}
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <div className={`h-2 w-2 rounded-full transition-colors duration-300 ${
              isWebSocketConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'
            }`} />
            <span className={`transition-colors duration-300 ${
              isWebSocketConnected ? 'text-green-600' : 'text-red-600'
            }`}>
              {isWebSocketConnected ? 'Connected' : 'Disconnected'}
            </span>
            {currentJobId && (
              <div className="flex items-center text-blue-600 ml-2">
                <Clock className="h-3 w-3 mr-1 animate-spin" /> 
                Processing: {currentJobId.substring(0, 8)}...
              </div>
            )}
          </div>
          <div className="text-xs text-gray-400 ml-2">
            Attempts: {connectionAttemptRef.current}
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            <Brain className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p>Welcome! Ask about geospatial analysis.</p>
            <p className="text-sm mt-2">
              Connection status: {isWebSocketConnected ? '✅ Ready' : '🔄 Connecting...'}
            </p>
            <p className="text-xs mt-1 text-gray-400">
              Debug: {JSON.stringify(webSocketService.getStatus())}
            </p>
          </div>
        ) : (
          messages.map(renderMsg)
        )}
        <div ref={messagesEndRef} />
      </main>

      {!isWebSocketConnected && (
        <div className="flex items-center gap-2 bg-yellow-100 text-yellow-800 px-4 py-2 text-sm border-t border-yellow-300">
          <AlertTriangle className="h-4 w-4" />
          <span>Disconnected from server. Messages will be queued until reconnection.</span>
        </div>
      )}

      <div className="flex border-t bg-white p-4 gap-2">
        <input
          type="text"
          value={inputMessage}
          onChange={e => setInputMessage(e.target.value)}
          placeholder="Type your geospatial question..."
          disabled={loading}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSubmit(e)
            }
          }}
          className="flex-1 border rounded px-3 py-2 focus:ring focus:border-blue-500 transition-colors"
        />
        <button
          type="submit"
          disabled={loading || !inputMessage.trim()}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2"
          onClick={handleSubmit}
        >
          {loading ? (
            <>
              <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
              Processing
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              Send
            </>
          )}
        </button>
      </div>
    </div>
  )
}

export default ChatWindow