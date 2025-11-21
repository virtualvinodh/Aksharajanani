
import React, { useEffect, useState } from 'react';
import { AppSettings, BoundingBox, Point, TransformState } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { VEC } from '../utils/vectorUtils';
import { CheckCircleIcon } from '../constants';

interface ContextualToolbarProps {
  selectionBox: BoundingBox;
  zoom: number;
  viewOffset: Point;
  onApplyTransform: (transform: TransformState & { flipX?: boolean; flipY?: boolean }) => void;
  previewTransform: TransformState | null;
  setPreviewTransform: (transform: TransformState | null) => void;
  containerWidth: number;
  containerHeight: number;
}

const ContextualToolbar: React.FC<ContextualToolbarProps> = ({
  selectionBox,
  zoom,
  viewOffset,
  onApplyTransform,
  previewTransform,
  setPreviewTransform,
  containerWidth,
  containerHeight
}) => {
  const { theme } = useTheme();
  const [rotateInput, setRotateInput] = useState('0');
  const [scaleInput, setScaleInput] = useState('1.0');

  // Reset inputs when selection changes (new selection box)
  useEffect(() => {
    if (!previewTransform) {
      setRotateInput('0');
      setScaleInput('1.0');
    }
  }, [previewTransform, selectionBox]); // selectionBox dependency ensures reset on new selection

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

  // Calculate Screen Position
  // 1. Convert Selection Center to Screen Coordinates
  const selCenterX = (selectionBox.x + selectionBox.width / 2) * zoom + viewOffset.x;
  const selTopY = selectionBox.y * zoom + viewOffset.y;

  // 2. Determine Toolbar Position (Above the selection, centered horizontally)
  const TOOLBAR_HEIGHT = 50;
  const PADDING = 15;
  
  // Default to above, flip to below if too close to top edge
  let top = selTopY - TOOLBAR_HEIGHT - PADDING;
  if (top < 10) {
      const selBottomY = (selectionBox.y + selectionBox.height) * zoom + viewOffset.y;
      top = selBottomY + PADDING;
  }

  // Clamp horizontal position to keep inside container
  const TOOLBAR_WIDTH = 280; // Approx width
  let left = selCenterX - TOOLBAR_WIDTH / 2;
  
  // Simple clamping
  left = Math.max(10, Math.min(left, containerWidth - TOOLBAR_WIDTH - 10));

  const buttonClass = "p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors";
  const activeButtonClass = "p-1.5 rounded-md bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 border border-indigo-500 transition-colors";
  const inputClass = "w-12 p-1 text-xs border rounded bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white text-center focus:ring-2 focus:ring-indigo-500 focus:outline-none";

  return (
    <div
      className="absolute z-30 flex items-center gap-2 p-2 bg-white dark:bg-gray-900 rounded-full shadow-xl border border-gray-200 dark:border-gray-700 animate-pop-in"
      style={{
        top: `${top}px`,
        left: `${left}px`,
        transformOrigin: 'bottom center'
      }}
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
          className="ml-1 p-1.5 bg-green-600 hover:bg-green-700 text-white rounded-full shadow-sm transition-colors"
          title="Apply Transformation"
        >
          <CheckCircleIcon className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

export default ContextualToolbar;