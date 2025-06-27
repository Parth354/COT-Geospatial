import React from 'react'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    }
  }

  static getDerivedStateFromError(error) {
    // Filter out known errors we don't want the error UI for
    if (ErrorBoundary.isIgnorableError(error)) {
      return null // Don't update state → no error UI rendered
    }
    return { hasError: true }
  }

  static isIgnorableError(error) {
    if (!error) return false
    const message = error.message || ''
    const ignorablePhrases = [
      'WebSocket connection error',
      'WebSocket disconnected',
      'WebSocket connection timeout'
    ]
    return ignorablePhrases.some((phrase) => message.includes(phrase))
  }

  componentDidCatch(error, errorInfo) {
    if (ErrorBoundary.isIgnorableError(error)) {
      console.log('⚠️ Ignored error in ErrorBoundary:', error.message)
      return
    }

    this.setState({
      error: error,
      errorInfo: errorInfo
    })

    if (process.env.NODE_ENV === 'development') {
      console.error('Error caught by boundary:', error)
      console.error('Error info:', errorInfo)
    }
  }

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    })
  }

  handleGoHome = () => {
    window.location.href = '/'
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6 text-center">
            <div className="mb-6">
              <AlertTriangle className="h-16 w-16 text-red-500 mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                Something went wrong
              </h1>
              <p className="text-gray-600">
                We're sorry, but something unexpected happened. Please try again or return to the home page.
              </p>
            </div>

            {process.env.NODE_ENV === 'development' && this.state.error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md text-left">
                <h3 className="font-medium text-red-800 mb-2">Error details:</h3>
                <pre className="text-xs text-red-700 whitespace-pre-wrap overflow-auto max-h-32">
                  {this.state.error.toString()}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={this.handleRetry}
                className="flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </button>

              <button
                onClick={this.handleGoHome}
                className="flex items-center justify-center px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
              >
                <Home className="h-4 w-4 mr-2" />
                Go Home
              </button>
            </div>

            <div className="mt-6 pt-4 border-t text-sm text-gray-500">
              If this problem persists, please contact support.
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
