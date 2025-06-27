import React, { useState, useEffect } from 'react'
import { ChevronDown, ChevronRight, Brain, Cog, CheckCircle, AlertCircle, Clock, Play, Pause } from 'lucide-react'
import { useAppContext } from '../hooks/useAppContext'

function CoTViewer() {
  const { state, dispatch } = useAppContext()
  const [expandedSteps, setExpandedSteps] = useState(new Set())
  const [wsConnection, setWsConnection] = useState(null)
  const [connectionStatus, setConnectionStatus] = useState('disconnected')

  // WebSocket connection management
  useEffect(() => {
    if (state.currentJobId && !wsConnection) {
      connectWebSocket(state.currentJobId)
    }

    return () => {
      if (wsConnection) {
        wsConnection.close()
      }
    }
  }, [state.currentJobId])

  const connectWebSocket = (jobId) => {
    try {
      const ws = new WebSocket(`ws://localhost:8000/ws`)
      
      ws.onopen = () => {
        setConnectionStatus('connected')
        // Join the job channel
        ws.send(JSON.stringify({
          type: 'join_channel',
          job_id: jobId
        }))
        setWsConnection(ws)
      }

      ws.onmessage = (event) => {
        const message = JSON.parse(event.data)
        handleWebSocketMessage(message)
      }

      ws.onclose = () => {
        setConnectionStatus('disconnected')
        setWsConnection(null)
      }

      ws.onerror = (error) => {
        console.error('WebSocket error:', error)
        setConnectionStatus('error')
      }

    } catch (error) {
      console.error('Failed to connect WebSocket:', error)
      setConnectionStatus('error')
    }
  }

  const handleWebSocketMessage = (message) => {
    switch (message.type) {
      case 'cot_step':
        dispatch({
          type: 'ADD_COT_STEP',
          payload: {
            id: `${message.job_id}-step-${message.step_number}`,
            stepNumber: message.step_number,
            stepType: message.step_type,
            title: getStepTitle(message.step_type, message.step_number),
            description: message.content,
            status: 'completed',
            timestamp: message.timestamp,
            jobId: message.job_id
          }
        })
        break

      case 'tool_execution':
        dispatch({
          type: 'UPDATE_COT_STEP',
          payload: {
            id: `${message.job_id}-tool-${message.tool}`,
            stepType: 'tool_execution',
            title: `Tool: ${message.tool}`,
            description: message.message,
            status: message.status,
            progress: message.progress,
            toolCall: {
              tool: message.tool,
              status: message.status,
              progress: message.progress
            },
            timestamp: new Date().toISOString()
          }
        })
        break

      case 'job_complete':
        dispatch({
          type: 'JOB_COMPLETE',
          payload: {
            jobId: message.job_id,
            status: message.status,
            resultsUrl: message.results_url
          }
        })
        break

      case 'error':
        dispatch({
          type: 'ADD_COT_STEP',
          payload: {
            id: `${message.job_id}-error-${Date.now()}`,
            stepType: 'error',
            title: 'Error Occurred',
            description: message.message,
            status: 'error',
            error: {
              code: message.error_code,
              message: message.message,
              details: message.details
            },
            timestamp: new Date().toISOString()
          }
        })
        break

      default:
        console.log('Unknown message type:', message.type)
    }
  }

  const getStepTitle = (stepType, stepNumber) => {
    const titles = {
      'reasoning': 'Analysis & Reasoning',
      'tool_execution': 'Tool Execution',
      'data_processing': 'Data Processing',
      'spatial_analysis': 'Spatial Analysis',
      'query_parsing': 'Query Interpretation',
      'result_synthesis': 'Result Synthesis'
    }
    return titles[stepType] || `Step ${stepNumber}`
  }

  const toggleStep = (stepId) => {
    const newExpanded = new Set(expandedSteps)
    if (newExpanded.has(stepId)) {
      newExpanded.delete(stepId)
    } else {
      newExpanded.add(stepId)
    }
    setExpandedSteps(newExpanded)
  }

  const getStepIcon = (step) => {
    switch (step.status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />
      case 'running':
        return <Clock className="h-4 w-4 text-blue-500 animate-pulse" />
      case 'pending':
        return <Pause className="h-4 w-4 text-gray-400" />
      default:
        return <Cog className="h-4 w-4 text-gray-400" />
    }
  }

  const getStepColor = (step) => {
    switch (step.status) {
      case 'completed':
        return 'bg-green-50 border-green-200'
      case 'error':
        return 'bg-red-50 border-red-200'
      case 'running':
        return 'bg-blue-50 border-blue-200'
      case 'pending':
        return 'bg-gray-50 border-gray-200'
      default:
        return 'bg-gray-50 border-gray-200'
    }
  }

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString()
  }

  const getProgressBar = (progress) => {
    if (!progress) return null
    return (
      <div className="mt-2">
        <div className="flex justify-between text-xs text-gray-600 mb-1">
          <span>Progress</span>
          <span>{progress}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className="bg-blue-500 h-2 rounded-full transition-all duration-300" 
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    )
  }

  // Sort steps by step number and timestamp
  const sortedSteps = [...(state.cotSteps || [])].sort((a, b) => {
    if (a.stepNumber !== b.stepNumber) {
      return (a.stepNumber || 0) - (b.stepNumber || 0)
    }
    return new Date(a.timestamp || 0) - new Date(b.timestamp || 0)
  })

  if (!state.cotSteps || state.cotSteps.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <div className="text-center text-gray-500 py-8">
          <Brain className="h-12 w-12 mx-auto mb-4 text-gray-300" />
          <p>No reasoning steps yet</p>
          <p className="text-sm">Chain-of-thought reasoning will appear here</p>
          {state.currentJobId && (
            <div className="mt-4 flex items-center justify-center space-x-2">
              <div className={`h-2 w-2 rounded-full ${
                connectionStatus === 'connected' ? 'bg-green-500' : 
                connectionStatus === 'error' ? 'bg-red-500' : 'bg-gray-400'
              }`} />
              <span className="text-xs text-gray-400">
                WebSocket: {connectionStatus}
              </span>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border">
      <div className="border-b p-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center">
            <Brain className="h-5 w-5 mr-2 text-blue-600" />
            Chain-of-Thought Reasoning
          </h3>
          <div className="flex items-center space-x-2">
            {state.currentJobId && (
              <span className="text-xs text-gray-500">
                Job: {state.currentJobId.slice(-8)}
              </span>
            )}
            <div className={`h-2 w-2 rounded-full ${
              connectionStatus === 'connected' ? 'bg-green-500' : 
              connectionStatus === 'error' ? 'bg-red-500' : 'bg-gray-400'
            }`} />
          </div>
        </div>
      </div>
      
      <div className="p-4 space-y-3">
        {sortedSteps.map((step, index) => {
          const isExpanded = expandedSteps.has(step.id)
          const isLast = index === sortedSteps.length - 1

          return (
            <div key={step.id} className="relative">
              {/* Connection line */}
              {!isLast && (
                <div className="absolute left-6 top-12 bottom-0 w-0.5 bg-gray-200" />
              )}
              
              <div className={`border rounded-lg transition-all duration-200 ${getStepColor(step)}`}>
                <button
                  onClick={() => toggleStep(step.id)}
                  className="w-full p-4 text-left hover:bg-opacity-80 transition-colors"
                >
                  <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0 mt-1">
                      {getStepIcon(step)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium text-gray-900">
                          {step.title}
                        </h4>
                        <div className="flex items-center space-x-2">
                          {step.timestamp && (
                            <span className="text-xs text-gray-500">
                              {formatTimestamp(step.timestamp)}
                            </span>
                          )}
                          {step.duration && (
                            <span className="text-xs text-gray-500">
                              {step.duration}ms
                            </span>
                          )}
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-gray-400" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-gray-400" />
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">
                        {step.description}
                      </p>
                      {step.status === 'running' && getProgressBar(step.progress)}
                    </div>
                  </div>
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t bg-white bg-opacity-50 p-4">
                    {/* Step Type and Number */}
                    <div className="mb-4 flex items-center space-x-4">
                      <div className="text-xs text-gray-500">
                        Type: <span className="font-medium">{step.stepType}</span>
                      </div>
                      {step.stepNumber && (
                        <div className="text-xs text-gray-500">
                          Step: <span className="font-medium">{step.stepNumber}</span>
                        </div>
                      )}
                      {step.jobId && (
                        <div className="text-xs text-gray-500">
                          Job: <span className="font-medium">{step.jobId.slice(-8)}</span>
                        </div>
                      )}
                    </div>

                    {/* Reasoning - for reasoning type steps */}
                    {step.reasoning && (
                      <div className="mb-4">
                        <h5 className="font-medium text-gray-800 mb-2">Reasoning:</h5>
                        <p className="text-sm text-gray-700 leading-relaxed">
                          {step.reasoning}
                        </p>
                      </div>
                    )}

                    {/* Tool Call - for tool execution steps */}
                    {step.toolCall && (
                      <div className="mb-4">
                        <h5 className="font-medium text-gray-800 mb-2">Tool Execution:</h5>
                        <div className="bg-gray-900 rounded-md p-3 text-sm">
                          <pre className="text-green-400 font-mono">
                            {JSON.stringify(step.toolCall, null, 2)}
                          </pre>
                        </div>
                        {step.toolCall.progress && (
                          <div className="mt-2">
                            {getProgressBar(step.toolCall.progress)}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Observation */}
                    {step.observation && (
                      <div className="mb-4">
                        <h5 className="font-medium text-gray-800 mb-2">Observation:</h5>
                        <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                          <p className="text-sm text-blue-800">
                            {step.observation}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Results */}
                    {step.results && (
                      <div className="mb-4">
                        <h5 className="font-medium text-gray-800 mb-2">Results:</h5>
                        <div className="bg-green-50 border border-green-200 rounded-md p-3">
                          {typeof step.results === 'object' ? (
                            <pre className="text-sm text-green-800 font-mono whitespace-pre-wrap">
                              {JSON.stringify(step.results, null, 2)}
                            </pre>
                          ) : (
                            <p className="text-sm text-green-800">
                              {step.results}
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Error - for error steps */}
                    {step.error && (
                      <div className="mb-4">
                        <h5 className="font-medium text-gray-800 mb-2">Error:</h5>
                        <div className="bg-red-50 border border-red-200 rounded-md p-3">
                          <div className="text-sm text-red-800">
                            {step.error.code && (
                              <div className="font-medium mb-1">
                                Code: {step.error.code}
                              </div>
                            )}
                            <div className="mb-2">
                              {step.error.message || step.error}
                            </div>
                            {step.error.details && (
                              <div className="text-xs text-red-600 mt-2 font-mono">
                                {step.error.details}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Metadata */}
                    {step.metadata && (
                      <div>
                        <h5 className="font-medium text-gray-800 mb-2">Metadata:</h5>
                        <div className="text-xs text-gray-600 space-y-1">
                          {Object.entries(step.metadata).map(([key, value]) => (
                            <div key={key} className="flex">
                              <span className="font-medium w-20">{key}:</span>
                              <span>{typeof value === 'object' ? JSON.stringify(value) : value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default CoTViewer