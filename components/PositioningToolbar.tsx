
import React, { useState, useEffect } from 'react';
import { useLocale } from '../contexts/LocaleContext';
import { useFitColumns } from '../hooks/useFitColumns';
import { PasteIcon, PanIcon, ZoomInIcon, ZoomOutIcon, SelectIcon } from '../constants';

interface PositioningToolbarProps {
  onReuseClick: () => void;
  pageTool: 'select' | 'pan';
  onToggleTool: () => void;
  onZoom: (factor: number) => void;
  orientation?: 'vertical' | 'horizontal';
  reuseDisabled?: boolean;
  manualX: string;
  manualY: string;
  onManualChange: (axis: 'x' | 'y', value: string) => void;
  onManualCommit: (x?: string, y?: string) => void;
  setIsInputFocused: (focused: boolean) => void;
  canEdit: boolean;
}

const ToolButton: React.FC<{ isActive: boolean, label: string, onClick: () => void, children: React.ReactNode }> = React.memo(({ isActive, label, onClick, children }) => (
    <button
      onClick={onClick}
      title={label}
      className={`p-2 rounded-lg transition-all shadow-sm ${
        isActive
          ? 'bg-indigo-600 text-white ring-2 ring-indigo-300 dark:ring-indigo-900'
          : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 border border-gray-200 dark:border-gray-600'
      }`}
    >
      {children}
    </button>
));

const ActionButton: React.FC<{ onClick: () => void, title: string, disabled?: boolean, children: React.ReactNode }> = React.memo(({ onClick, title, disabled, children }) => (
  <button
    onClick={onClick}
    title={title}
    disabled={disabled}
    className="p-2 rounded-lg transition-all bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 border border-gray-200 dark:border-gray-600 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
  >
    {children}
  </button>
));

const CoordinateInput: React.FC<{
    axis: 'x' | 'y';
    value: string;
    onChange: (v: string) => void;
    onCommit: (val: string) => void;
    onFocus: (focused: boolean) => void;
    disabled: boolean;
}> = ({ axis, value, onChange, onCommit, onFocus, disabled }) => {
    const [localValue, setLocalValue] = useState(value);

    // Sync from parent if externally changed (e.g. on drag)
    useEffect(() => {
        setLocalValue(value);
    }, [value]);

    return (
        <div className="flex flex-col items-center gap-0.5">
            <label className="text-[11px] font-black text-gray-400 uppercase leading-none">{axis}</label>
            <input
                type="text"
                value={localValue}
                onChange={(e) => {
                    const val = e.target.value;
                    setLocalValue(val);
                    onChange(val);
                    onCommit(val); // Trigger immediate calculation in session hook
                }}
                onFocus={() => onFocus(true)}
                onBlur={() => {
                    onChange(localValue);
                    onCommit(localValue);
                    onFocus(false);
                }}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        onChange(localValue);
                        onCommit(localValue);
                        e.currentTarget.blur();
                    }
                }}
                disabled={disabled}
                className="w-10 p-1 border rounded bg-white dark:bg-gray-900 dark:border-gray-600 font-mono text-center text-[11px] focus:ring-2 focus:ring-accent focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            />
        </div>
    );
};

const PositioningToolbar: React.FC<PositioningToolbarProps> = ({ 
    onReuseClick, pageTool, onToggleTool, onZoom, orientation = 'vertical', 
    reuseDisabled = false, manualX, manualY, onManualChange, onManualCommit, canEdit, setIsInputFocused
}) => {
  const { t } = useLocale();
  const isVertical = orientation === 'vertical';
  // Side toolbar: wrap into extra columns rather than run past the canvas on short screens.
  const sideToolbarRef = useFitColumns<HTMLDivElement>(1, 3, isVertical);

  return (
    <div ref={sideToolbarRef} className={`${isVertical ? 'grid justify-items-center content-start max-h-full w-max' : 'flex flex-row flex-wrap justify-center'} gap-2 p-1.5 bg-gray-100/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg items-center max-w-[95vw]`}>
      <ActionButton onClick={onReuseClick} title={t('copyPositionFrom')} disabled={reuseDisabled}>
        <PasteIcon />
      </ActionButton>
      
      <div className={`${isVertical ? 'h-px w-full my-0.5 col-span-full' : 'hidden sm:block w-px h-6 mx-0.5'} bg-gray-300 dark:bg-gray-600`}></div>

      <ToolButton
        isActive={pageTool === 'select'}
        label={t('select')}
        onClick={pageTool === 'select' ? () => {} : onToggleTool}
      >
        <SelectIcon />
      </ToolButton>
      
      <ToolButton
        isActive={pageTool === 'pan'}
        label={t('pan')}
        onClick={pageTool === 'pan' ? () => {} : onToggleTool}
      >
        <PanIcon />
      </ToolButton>

      <div className={`${isVertical ? 'h-px w-full my-0.5 col-span-full' : 'hidden sm:block w-px h-6 mx-0.5'} bg-gray-300 dark:bg-gray-600`}></div>

      <ActionButton onClick={() => onZoom(1.25)} title={t('zoomIn')}>
        <ZoomInIcon />
      </ActionButton>
      <ActionButton onClick={() => onZoom(0.8)} title={t('zoomOut')}>
        <ZoomOutIcon />
      </ActionButton>

      <div className={`${isVertical ? 'h-px w-full my-1 col-span-full' : 'hidden sm:block w-px h-6 mx-0.5'} bg-gray-300 dark:bg-gray-600`}></div>

      <div className={isVertical ? 'contents' : 'flex flex-row gap-2'}>
          <CoordinateInput axis="x" value={manualX} onChange={v => onManualChange('x', v)} onCommit={(val) => onManualCommit(val, undefined)} onFocus={setIsInputFocused} disabled={!canEdit} />
          <CoordinateInput axis="y" value={manualY} onChange={v => onManualChange('y', v)} onCommit={(val) => onManualCommit(undefined, val)} onFocus={setIsInputFocused} disabled={!canEdit} />
      </div>
    </div>
  );
};

export default React.memo(PositioningToolbar);
