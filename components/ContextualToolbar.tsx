
import React, { useEffect, useState, useRef } from 'react';
import { BoundingBox, Point, TransformState } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { CheckCircleIcon, ControlPointsIcon } from '../constants';
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
  onEditMode: () => void;
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
  internalCanvasSize,
  onEditMode
}) => {
  const { theme } = useTheme();
  const [rotateInput, setRotateInput] = useState('0');
  const [scaleInput, setScaleInput] = useState('1.0');
  
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [toolbarWidth, setToolbarWidth] = useState(0);

  const isMobile = useMediaQuery('(max-width: 768px)');

  useEffect(() => {
    if (!previewTransform) {
      setRotateInput('0');
      setScaleInput('1.0');
    }
  }, [previewTransform, selectionBox]);

  // Continuously monitor toolbar width to handle content changes
  useEffect(() => {
    if (!toolbarRef.current) return;
    const ro = new ResizeObserver(entries => {
        for (const entry of entries) {
            // borderBoxSize is more accurate for absolute positioning bounds
            if (entry.borderBoxSize?.[0]) {
                setToolbarWidth(entry.borderBoxSize[0].inlineSize);
            } else {
                setToolbarWidth(entry.contentRect.width);
            }
        }
    });
    ro.observe(toolbarRef.current);
    return () => ro.disconnect();
  }, []);

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

  // Determine readiness to prevent layout jumps
  const isReady = toolbarWidth > 0 && containerWidth > 0 && containerHeight > 0;
  
  let style: React.CSSProperties = {};

  if (isMobile) {
    style = {
        position: 'absolute', 
        bottom: '16px', 
        left: '0',
        right: '0',
        marginLeft: 'auto',
        marginRight: 'auto',
        width: 'fit-content',
        maxWidth: '95%',
        pointerEvents: isReady ? 'auto' : 'none',
        zIndex: 40,
        opacity: isReady ? 1 : 0
    };
  } else {
    // 1. Determine Scale/Offset to map Design Units -> Container Pixels
    const containerAspectRatio = containerWidth / containerHeight;
    const canvasAspectRatio = 1;

    let displayedCanvasWidth;
    let canvasLeftOffset = 0;
    let canvasTopOffset = 0;

    if (containerAspectRatio > canvasAspectRatio) {
        // Pillarbox (Height matches container, Width is centered)
        const displayedCanvasHeight = containerHeight;
        displayedCanvasWidth = displayedCanvasHeight * canvasAspectRatio;
        canvasLeftOffset = (containerWidth - displayedCanvasWidth) / 2;
    } else {
        // Letterbox (Width matches container, Height is centered)
        displayedCanvasWidth = containerWidth;
        const displayedCanvasHeight = displayedCanvasWidth / canvasAspectRatio;
        canvasTopOffset = (containerHeight - displayedCanvasHeight) / 2;
    }

    const domScale = internalCanvasSize > 0 ? displayedCanvasWidth / internalCanvasSize : 1;
    
    // 2. Map Selection Center to Container Coordinates
    const domSelLeft = canvasLeftOffset + (selectionBox.x * zoom + viewOffset.x) * domScale;
    const domSelTop = canvasTopOffset + (selectionBox.y * zoom + viewOffset.y) * domScale;
    const domSelWidth = (selectionBox.width * zoom) * domScale;
    const domSelCenterX = domSelLeft + domSelWidth / 2;

    const TOOLBAR_HEIGHT = 44; 
    const GAP = 25; 
    const PADDING = 10;
    
    // 3. Calculate Vertical Position (Preferred: Above, Fallback: Inside Top)
    let top = domSelTop - TOOLBAR_HEIGHT - GAP;
    top = Math.max(PADDING, top);
    top = Math.min(top, containerHeight - TOOLBAR_HEIGHT - PADDING);

    // 4. Calculate Horizontal Position (Exact Left Edge)
    // Centered attempt: Center - HalfWidth
    let left = domSelCenterX - (toolbarWidth / 2);
    
    // Strict Clamping
    const minLeft = PADDING;
    const maxLeft = containerWidth - toolbarWidth - PADDING;
    
    if (maxLeft < minLeft) {
        // Edge case: Container smaller than toolbar + padding -> Center it simply
        left = (containerWidth - toolbarWidth) / 2;
    } else {
        left = Math.max(minLeft, Math.min(left, maxLeft));
    }

    style = {
        position: 'absolute',
        top: `${top}px`,
        left: `${left}px`,
        width: 'fit-content',
        whiteSpace: 'nowrap',
        pointerEvents: isReady ? 'auto' : 'none',
        zIndex: 40,
        opacity: isReady ? 1 : 0
    };
  }

  const buttonClass = "p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors flex-shrink-0";
  const activeButtonClass = "p-1.5 rounded-md bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 border border-indigo-500 transition-colors flex-shrink-0";
  const inputClass = "w-12 p-1 text-xs border rounded bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white text-center focus:ring-2 focus:ring-indigo-500 focus:outline-none";

  return (
    <div
      ref={toolbarRef}
      className="flex items-center gap-2 p-2 bg-white dark:bg-gray-900 rounded-full shadow-xl border border-gray-200 dark:border-gray-700 animate-pop-in overflow-x-auto no-scrollbar"
      style={style}
      onMouseDown={(e) => e.stopPropagation()} 
    >
       <div className="flex items-center border-r border-gray-200 dark:border-gray-700 pr-2 mr-1">
        <button
            onClick={onEditMode}
            title="Edit Points"
            className={buttonClass}
        >
             <ControlPointsIcon />
        </button>
      </div>

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

      <div className="flex items-center gap-1">
        <span className="text-xs text-gray-500 font-medium">R°</span>
        <input
          type="text"
          value={rotateInput}
          onChange={(e) => handleTransformChange('rotate', e.target.value)}
          onKeyDown={handleKeyDown}
          className={inputClass}
          title="Rotate (Degrees)"
        />
      </div>

      <div className="flex items-center gap-1">
        <span className="text-xs text-gray-500 font-medium">S</span>
        <input
          type="text"
          value={scaleInput}
          onChange={(e) => handleTransformChange('scale', e.target.value)}
          onKeyDown={handleKeyDown}
          className={inputClass}
          title="Scale (Multiplier)"
        />
      </div>

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
