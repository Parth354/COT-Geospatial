import React from 'react';
import { AlertTriangle, RefreshCw, Clipboard } from 'lucide-react';


class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error) {
    // This lifecycle method renders a fallback UI after an error has been thrown.
    // It is the first step in the error handling process.
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // This lifecycle method logs the error information.
    // We can also send this to an external logging service (e.g., Sentry, LogRocket).
    this.setState({ errorInfo: errorInfo });

    // In a production environment, you would log errors to a service.
    // For example: logErrorToMyService(error, errorInfo);
    if (process.env.NODE_ENV === 'development') {
      console.error("ErrorBoundary caught an error:", error, errorInfo);
    }
  }

  handleCopyError = () => {
    const { error, errorInfo } = this.state;
    const errorText = `
--- Error Message ---
${error?.toString()}

--- Component Stack ---
${errorInfo?.componentStack}
    `;
    navigator.clipboard.writeText(errorText.trim())
      .then(() => alert('Error details copied to clipboard!'))
      .catch(() => alert('Failed to copy error details.'));
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4 font-sans">
          <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl p-8 text-center">
            <div className="mb-6">
              <AlertTriangle className="h-16 w-16 text-red-500 mx-auto mb-4 animate-pulse" />
              <h1 className="text-3xl font-bold text-gray-800 mb-2">
                Application Error
              </h1>
              <p className="text-gray-600">
                We're sorry, a critical error occurred and the application cannot continue.
                Please try refreshing the page.
              </p>
            </div>

            {/* Enhanced Debugging Information for Developers */}
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md text-left">
                <div className="flex justify-between items-center mb-2">
                    <h3 className="font-semibold text-red-800">Developer Error Details:</h3>
                    <button
                        onClick={this.handleCopyError}
                        className="p-1 text-gray-500 hover:bg-gray-200 rounded-md"
                        title="Copy error to clipboard"
                    >
                        <Clipboard className="h-4 w-4"/>
                    </button>
                </div>
                <div className="text-xs text-red-700 bg-white p-2 rounded overflow-auto max-h-40 font-mono shadow-inner">
                  <p className="font-bold">{this.state.error.toString()}</p>
                  <pre className="mt-2 whitespace-pre-wrap">
                    {this.state.errorInfo?.componentStack}
                  </pre>
                </div>
              </div>
            )}

            {/* Primary Call-to-Action */}
            <div className="flex justify-center">
              <button
                onClick={() => window.location.reload()}
                className="w-full flex items-center justify-center px-6 py-3 bg-blue-600 text-white font-bold text-lg rounded-md hover:bg-blue-700 transition-transform transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-blue-300"
              >
                <RefreshCw className="h-5 w-5 mr-2" />
                Refresh Page
              </button>
            </div>
            
            <div className="mt-6 pt-4 border-t text-sm text-gray-500">
              If this problem persists, please contact support.
            </div>
          </div>
        </div>
      );
    }

    // If there is no error, render the children components as normal.
    return this.props.children;
  }
}

export default ErrorBoundary;