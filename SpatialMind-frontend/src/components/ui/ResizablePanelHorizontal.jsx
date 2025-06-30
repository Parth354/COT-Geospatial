import React, { useState, useRef, useCallback, useEffect } from 'react';

export const ResizablePanelHorizontal = ({ leftPanel, rightPanel, defaultWidth = 30 }) => {
  const [panelWidth, setPanelWidth] = useState(defaultWidth);
  const isResizing = useRef(false);
  const containerRef = useRef(null);

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    isResizing.current = true;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
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
    // ✅ FIX: Calculate new width relative to the container's left edge
    let newWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;

    // Constrain the width between reasonable min/max percentages
    if (newWidth < 20) newWidth = 20;
    if (newWidth > 60) newWidth = 60;
    setPanelWidth(newWidth);
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
    // We add the ref to the main flex container
    <div className="flex h-full w-full" ref={containerRef}>
      <div className="min-w-0" style={{ width: `${panelWidth}%` }}>
        {leftPanel}
      </div>

      <div
        onMouseDown={handleMouseDown}
        className="w-2 flex-shrink-0 cursor-col-resize flex items-center justify-center bg-gray-200 hover:bg-blue-500 transition-colors group"
      >
        <div className="w-0.5 h-10 bg-gray-400 rounded-full group-hover:bg-white"></div>
      </div>
      
      <div className="flex-grow min-w-0">
        {rightPanel}
      </div>
    </div>
  );
};