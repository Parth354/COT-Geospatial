class WebSocketService {
  constructor() {
    this.socket = null;
    this.isConnecting = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectTimeout = null;

    this.dispatcher = (action) => {
      console.warn('[WS Service] Dispatcher not registered. Discarding action:', action);
    };

    this.activeSubscriptions = new Set();
  }


  _internalConnect() {
    if (this.socket || this.isConnecting) return;
    
    this.isConnecting = true;
    // Use the same API URL logic as api.js - default to localhost:8000
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
    const wsUrl = baseUrl.replace(/^http/, 'ws') + '/ws';
    console.log(`[WS Service] Initializing connection to: ${wsUrl}`);

    this.socket = new WebSocket(wsUrl);

    this.socket.onopen = () => {
      console.log('[WS Service] Connection established.');
      this.isConnecting = false;
      this.reconnectAttempts = 0;
      if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
      this.dispatcher({ type: 'SET_WEBSOCKET_CONNECTED', payload: true });
      this._resubscribeToChannels();
    };

    this.socket.onmessage = (event) => {
      try {
        let message;
        
        // FastAPI WebSocket sends JSON strings, so we need to parse them
        if (typeof event.data === 'string') {
          message = JSON.parse(event.data);
        } else if (event.data instanceof Blob) {
          // Handle Blob if needed
          event.data.text().then(text => {
            try {
              const parsed = JSON.parse(text);
              this._handleParsedMessage(parsed);
            } catch (e) {
              console.error('[WS Service] Failed to parse Blob message:', e);
            }
          });
          return;
        } else {
          message = event.data;
        }
        
        this._handleParsedMessage(message);
      } catch (err) {
        console.error('[WS Service] Failed to parse or process server message:', err, 'Raw data:', event.data);
      }
    };
    
    this._handleParsedMessage = (message) => {
      console.log('[WS Service] Received message:', message);
      
      if (!message || typeof message !== 'object') {
        console.warn('[WS Service] Invalid message format:', message);
        return;
      }
      
      if (message.type === 'ping') {
        this.safeSend({ type: 'pong' });
        return;
      }

      const { type, ...payload } = message;

      if (!type) {
        console.warn('[WS Service] Received message without a type:', message);
        return;
      }

      const formattedAction = {
        type: type.toUpperCase(),
        payload: payload 
      };

      console.log('[WS Service] Dispatching action:', formattedAction);
      this.dispatcher(formattedAction);
    };

    this.socket.onerror = (error) => {
      console.error(' [WS Service] WebSocket error occurred:', error);
    };

    this.socket.onclose = (event) => {
      console.warn(`[WS Service] Connection closed (Code: ${event.code}).`);
      this.socket = null;
      this.isConnecting = false;
      this.dispatcher({ type: 'SET_WEBSOCKET_CONNECTED', payload: false });
      
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000); 
        console.log(`[WS Service] Reconnecting in ${delay}ms... (Attempt ${this.reconnectAttempts})`);
        this.reconnectTimeout = setTimeout(() => this._internalConnect(), delay);
      } else {
        console.error('[WS Service] Max reconnect attempts reached. Aborting.');
        this.dispatcher({ 
          type: 'SET_ERROR', 
          payload: { message: 'Could not connect to the server.', details: 'Please check your connection and refresh the page.' }
        });
      }
    };
  }

  registerDispatcher(dispatchFn) {
    if (typeof dispatchFn === 'function') {
      this.dispatcher = dispatchFn;
      console.log('[WS Service] Dispatcher registered successfully.');
      
      // Check current socket state and update accordingly
      if (this.socket) {
        if (this.socket.readyState === WebSocket.OPEN) {
          console.log('[WS Service] Socket already connected, updating state.');
          this.dispatcher({ type: 'SET_WEBSOCKET_CONNECTED', payload: true });
        } else if (this.socket.readyState === WebSocket.CONNECTING) {
          console.log('[WS Service] Socket is connecting, waiting...');
        } else {
          console.log('[WS Service] Socket exists but not open, state:', this.socket.readyState);
          this.dispatcher({ type: 'SET_WEBSOCKET_CONNECTED', payload: false });
        }
      } else if (!this.isConnecting) {
        // If no connection attempt is in progress, start one
        console.log('[WS Service] No connection found, initiating connection.');
        this._internalConnect();
      }
    } else {
       console.error("[WS Service] Attempted to register a non-function dispatcher.");
    }
  }
  
  // Public method to check connection status
  getConnectionStatus() {
    if (!this.socket) return false;
    return this.socket.readyState === WebSocket.OPEN;
  }

  unregisterDispatcher() {
    this.dispatcher = (action) => {
        console.warn('[WS Service] Dispatcher not registered. Discarding action:', action);
    };
  }
  
  safeSend(message) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    } else {
      console.warn('[WS Service] Could not send, socket not open:', message);
    }
  }

  subscribe(jobId) {
    if (!jobId) return;
    this.activeSubscriptions.add(jobId);
    this.safeSend({ type: 'subscribe', channel: jobId });
  }

  unsubscribe(jobId) {
    if (!jobId) return;
    this.activeSubscriptions.delete(jobId);
    this.safeSend({ type: 'unsubscribe', channel: jobId });
  }

  _resubscribeToChannels() {
    if (this.activeSubscriptions.size > 0) {
      console.log('[WS Service] Re-subscribing to channels:', Array.from(this.activeSubscriptions));
      this.activeSubscriptions.forEach(jobId => this.safeSend({ type: 'subscribe', channel: jobId }));
    }
  }
}
const webSocketService = new WebSocketService();
// Don't connect immediately - wait for dispatcher to be registered
// webSocketService._internalConnect();
export default webSocketService;