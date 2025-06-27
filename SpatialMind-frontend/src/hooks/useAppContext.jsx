// hooks/useAppContext.jsx
import React, { createContext, useContext, useReducer } from 'react'
import { appReducer, initialState } from './appReducer'
import { initializeStore, store } from './store'

const AppContext = createContext()

export const AppProvider = ({ children }) => {
  const [state, dispatch] = useReducer(appReducer, initialState)

  // Setup global store access
  store.state = state
  initializeStore(dispatch)

  return (
    <AppContext.Provider value={{ state, dispatch, actions: store.actions }}>
      {children}
    </AppContext.Provider>
  )
}

export const useAppContext = () => {
  const context = useContext(AppContext)
  if (!context) throw new Error('useAppContext must be used within an AppProvider')
  return context
}
