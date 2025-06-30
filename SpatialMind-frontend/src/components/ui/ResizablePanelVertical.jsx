import React, { useState, useRef, useCallback, useEffect } from 'react';

export const ResizablePanelVertical = ({ topPanel, bottomPanel, defaultHeight = 60 }) => {
  const [panelHeight, setPanelHeight] = useState(defaultHeight);
  const isResizing = useRef(false);
  const containerRef = useRef(null); // Ref to the container of this vertical panel

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    isResizing.current = true;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'row-resize';
  }, []);

  const handleMouseUp = useCallback(() => {
    isResizing.current = false;
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (!isResizing.current || !containerRef.current) {
      return;
    }
    const containerRect = containerRef.current.getBoundingClientRect();
    // ✅ FIX: Calculate new height relative to the container's top edge
    let newHeight = ((e.clientY - containerRect.top) / containerRect.height) * 100;
    
    // Constrain the height
    if (newHeight < 25) newHeight = 25; // min 25% height
    if (newHeight > 75) newHeight = 75; // max 75% height
    setPanelHeight(newHeight);
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);
  
  return (
    // The ref is added to this container
    <div className="flex flex-col h-full w-full" ref={containerRef}>
      <div className="flex-grow min-h-0" style={{ height: `${panelHeight}%` }}>
        {topPanel}
      </div>
      
      <div
        onMouseDown={handleMouseDown}
        className="h-2 flex-shrink-0 cursor-row-resize flex items-center justify-center bg-gray-200 hover:bg-blue-500 transition-colors group"
      >
        <div className="h-0.5 w-10 bg-gray-400 rounded-full group-hover:bg-white"></div>
      </div>

      <div className="flex-grow min-h-0" style={{ height: `${100 - panelHeight}%` }}>
        {bottomPanel}
      </div>
    </div>
  );
};