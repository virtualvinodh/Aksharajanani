
import React from 'react';
import { useLocale } from '../contexts/LocaleContext';
import { PasteIcon, PanIcon, ZoomInIcon, ZoomOutIcon, SelectIcon } from '../constants';

interface PositioningToolbarProps {
  onReuseClick: () => void;
  pageTool: 'select' | 'pan';
  onToggleTool: () => void;
  onZoom: (factor: number) => void;
  orientation?: 'vertical' | 'horizontal';
  reuseDisabled?: boolean;
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

const PositioningToolbar: React.FC<PositioningToolbarProps> = ({ onReuseClick, pageTool, onToggleTool, onZoom, orientation = 'vertical', reuseDisabled = false }) => {
  const { t } = useLocale();
  const isVertical = orientation === 'vertical';

  return (
    <div className={`flex ${isVertical ? 'flex-col' : 'flex-row'} gap-2 p-1.5 bg-gray-100/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg`}>
      <ActionButton onClick={onReuseClick} title={t('copyPositionFrom')} disabled={reuseDisabled}>
        <PasteIcon />
      </ActionButton>
      
      <div className={`${isVertical ? 'h-px w-full my-0.5' : 'w-px h-full mx-0.5'} bg-gray-300 dark:bg-gray-600`}></div>

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

      <div className={`${isVertical ? 'h-px w-full my-0.5' : 'w-px h-full mx-0.5'} bg-gray-300 dark:bg-gray-600`}></div>

      <ActionButton onClick={() => onZoom(1.25)} title={t('zoomIn')}>
        <ZoomInIcon />
      </ActionButton>
      <ActionButton onClick={() => onZoom(0.8)} title={t('zoomOut')}>
        <ZoomOutIcon />
      </ActionButton>
    </div>
  );
};

export default React.memo(PositioningToolbar);
