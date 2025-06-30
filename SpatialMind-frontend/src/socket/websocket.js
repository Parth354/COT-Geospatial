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
    const baseUrl = import.meta.env.VITE_API_URL || window.location.origin;
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
        const message = JSON.parse(event.data);
        
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

        this.dispatcher(formattedAction);

      } catch (err) {
        console.error('[WS Service] Failed to parse or process server message:', err);
      }
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
    } else {
       console.error("[WS Service] Attempted to register a non-function dispatcher.");
    }
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
webSocketService._internalConnect();
export default webSocketService;