import React, { createContext, useContext, useReducer } from 'react';
import { appReducer } from '../store/appReducer.js';
import { useAppActions } from './useAppActions';
import { initialState } from '../store/initialState.js';

const AppContext = createContext(null);

export const AppProvider = ({ children }) => {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const actions = useAppActions(dispatch);


  const value = {
    state,
    actions,
    dispatch,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};