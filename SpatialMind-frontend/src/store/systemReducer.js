/**
 * Handles top-level system state like session, connection, and errors.
 */
export function systemReducer(state, action) {
  switch(action.type) {
    case 'SET_SESSION_ID':
      return { ...state, sessionId: action.payload };
    
    case 'SYSTEM_CONNECTED':
      return { ...state, sessionId: action.payload?.session_id, websocketConnected: true };

    case 'SET_WEBSOCKET_CONNECTED':
      return { ...state, websocketConnected: action.payload };

    case 'SET_ERROR':
      return { ...state, error: action.payload, isAgentLoading: false };

    case 'CLEAR_ERROR':
      return { ...state, error: null };
    
    // ADDED NOTIFICATION ACTIONS
    case 'ADD_NOTIFICATION':
      const newNotification = { id: `notif_${Date.now()}`, ...action.payload.notification };
      return { ...state, notifications: [...state.notifications, newNotification] };

    case 'REMOVE_NOTIFICATION':
      return { ...state, notifications: state.notifications.filter(n => n.id !== action.payload.id) };
    
    default:
      return state;
  }
}