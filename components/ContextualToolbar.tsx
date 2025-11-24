import React, { useEffect, useState } from 'react';
import { BoundingBox, Point, TransformState } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { CheckCircleIcon } from '../constants';
import { useMediaQuery } from '../hooks/useMediaQuery';

interface ContextualToolbarProps {
  selectionBox: BoundingBox;
  zoom: number;
  viewOffset: Point;
  onApplyTransform: (transform: TransformState & { flipX?: boolean; flipY?: boolean }) => void;
  previewTransform: TransformState | null;
  setPreviewTransform: (transform: TransformState & { flipX?: boolean; flipY?: boolean } | null) => void;
  containerWidth: number;
  containerHeight: number;
  internalCanvasSize: number;
}

const ContextualToolbar: React.FC<ContextualToolbarProps> = ({
  selectionBox,
  zoom,
  viewOffset,
  onApplyTransform,
  previewTransform,
  setPreviewTransform,
  containerWidth,
  containerHeight,
  internalCanvasSize
}) => {
  const { theme } = useTheme();
  const [rotateInput, setRotateInput] = useState('0');
  const [scaleInput, setScaleInput] = useState('1.0');
  
  // Detect mobile screens to switch between docking modes
  const isMobile = useMediaQuery('(max-width: 768px)');

  // Reset inputs when selection changes (new selection box)
  useEffect(() => {
    if (!previewTransform) {
      setRotateInput('0');
      setScaleInput('1.0');
    }
  }, [previewTransform, selectionBox]);

  const handleTransformChange = (type: 'rotate' | 'scale', value: string) => {
    if (type === 'rotate') setRotateInput(value);
    if (type === 'scale') setScaleInput(value);

    const r = parseFloat(type === 'rotate' ? value : rotateInput) || 0;
    const s = parseFloat(type === 'scale' ? value : scaleInput) || 1;
    const flipX = previewTransform?.flipX;
    const flipY = previewTransform?.flipY;

    setPreviewTransform({ rotate: r, scale: s, flipX, flipY });
  };

  const getCurrentValues = () => {
      const r = parseFloat(rotateInput) || 0;
      const s = parseFloat(scaleInput) || 1;
      return { r, s };
  };

  const commitTransform = () => {
    const { r, s } = getCurrentValues();
    const flipX = previewTransform?.flipX;
    const flipY = previewTransform?.flipY;

    if (r !== 0 || s !== 1 || flipX || flipY) {
      onApplyTransform({ rotate: r, scale: s, flipX, flipY });
    }
  };

  const handleFlip = (axis: 'X' | 'Y') => {
      const { r, s } = getCurrentValues();
      const currentFlipX = previewTransform?.flipX ?? false;
      const currentFlipY = previewTransform?.flipY ?? false;
      
      const newFlipX = axis === 'X' ? !currentFlipX : currentFlipX;
      const newFlipY = axis === 'Y' ? !currentFlipY : currentFlipY;

      setPreviewTransform({ 
          rotate: r, 
          scale: s, 
          flipX: newFlipX, 
          flipY: newFlipY 
      });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      commitTransform();
    }
  };

  // --- Positioning Logic ---
  let style: React.CSSProperties = {};

  if (isMobile) {
    // Mobile: Absolute docking at the bottom center of the container
    style = {
        position: 'absolute', 
        bottom: '16px', 
        left: '0',
        right: '0',
        marginLeft: 'auto',
        marginRight: 'auto',
        width: 'fit-content',
        maxWidth: '95%',
        pointerEvents: 'auto',
        zIndex: 40
    };
  } else {
    // Desktop: Contextual positioning relative to selection
    const domScale = internalCanvasSize > 0 ? containerWidth / internalCanvasSize : 1;
    
    // Coordinates in DOM pixels
    const domSelLeft = (selectionBox.x * zoom + viewOffset.x) * domScale;
    const domSelTop = (selectionBox.y * zoom + viewOffset.y) * domScale;
    const domSelWidth = (selectionBox.width * zoom) * domScale;

    const domSelCenterX = domSelLeft + domSelWidth / 2;

    const TOOLBAR_HEIGHT = 44; 
    // Clamp 30 pixels above the bounding box
    const GAP = 50; 
    const VISUAL_MARGIN_TOP = 10;
    
    const TOOLBAR_HALF_WIDTH = 110; // Half-width guess for clamping

    // Calculate intended top position (above selection)
    let top = domSelTop - TOOLBAR_HEIGHT - GAP;

    // Clamp to viewport top edge to keep it visible
    top = Math.max(VISUAL_MARGIN_TOP, top);

    // Clamp Horizontal Position to keep it inside the container
    let left = domSelCenterX;
    left = Math.max(TOOLBAR_HALF_WIDTH, Math.min(left, containerWidth - TOOLBAR_HALF_WIDTH));

    style = {
        position: 'absolute',
        top: `${top}px`,
        left: `${left}px`,
        transform: 'translateX(-50%)',
        width: 'fit-content',
        pointerEvents: 'auto',
        zIndex: 40 
    };
  }

  const buttonClass = "p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors flex-shrink-0";
  const activeButtonClass = "p-1.5 rounded-md bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 border border-indigo-500 transition-colors flex-shrink-0";
  const inputClass = "w-12 p-1 text-xs border rounded bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white text-center focus:ring-2 focus:ring-indigo-500 focus:outline-none";

  return (
    <div
      className="flex items-center gap-2 p-2 bg-white dark:bg-gray-900 rounded-full shadow-xl border border-gray-200 dark:border-gray-700 animate-pop-in overflow-x-auto no-scrollbar"
      style={style}
      onMouseDown={(e) => e.stopPropagation()} // Prevent canvas drag start
    >
      {/* Flip Controls */}
      <div className="flex items-center gap-1 border-r border-gray-200 dark:border-gray-700 pr-2">
        <button 
            onClick={() => handleFlip('X')} 
            title="Flip Horizontal" 
            className={previewTransform?.flipX ? activeButtonClass : buttonClass}
        >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12L3 12M21 12L17 8M21 12L17 16M3 12L7 8M3 12L7 16"/></svg>
        </button>
        <button 
            onClick={() => handleFlip('Y')} 
            title="Flip Vertical" 
            className={previewTransform?.flipY ? activeButtonClass : buttonClass}
        >
             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3L12 21M12 3L8 7M12 3L16 7M12 21L8 17M12 21L16 17"/></svg>
        </button>
      </div>

      {/* Rotation */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-gray-500 font-medium">R°</span>
        <input
          type="number"
          value={rotateInput}
          onChange={(e) => handleTransformChange('rotate', e.target.value)}
          onKeyDown={handleKeyDown}
          className={inputClass}
          title="Rotate (Degrees)"
        />
      </div>

      {/* Scale */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-gray-500 font-medium">S</span>
        <input
          type="number"
          step="0.1"
          value={scaleInput}
          onChange={(e) => handleTransformChange('scale', e.target.value)}
          onKeyDown={handleKeyDown}
          className={inputClass}
          title="Scale (Multiplier)"
        />
      </div>

      {/* Apply Button (Only visible if changes made) */}
      {(previewTransform && (previewTransform.rotate !== 0 || previewTransform.scale !== 1.0 || previewTransform.flipX || previewTransform.flipY)) && (
        <button
          onClick={commitTransform}
          className="ml-1 p-1.5 bg-green-600 hover:bg-green-700 text-white rounded-full shadow-sm transition-colors flex-shrink-0"
          title="Apply Transformation"
        >
          <CheckCircleIcon className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

export default ContextualToolbar;