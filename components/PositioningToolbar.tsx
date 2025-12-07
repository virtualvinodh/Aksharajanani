
import React from 'react';
import { useLocale } from '../contexts/LocaleContext';
import { PasteIcon, PanIcon, ZoomInIcon, ZoomOutIcon, SelectIcon } from '../constants';

interface PositioningToolbarProps {
  onReuseClick: () => void;
  pageTool: 'select' | 'pan';
  onToggleTool: () => void;
  onZoom: (factor: number) => void;
  isLargeScreen: boolean;
}

const ToolButton: React.FC<{ isActive: boolean, label: string, onClick: () => void, children: React.ReactNode }> = React.memo(({ isActive, label, onClick, children }) => (
    <button
      onClick={onClick}
      title={label}
      className={`p-2 rounded-md transition-colors ${
        isActive
          ? 'bg-indigo-600 text-white'
          : 'bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-white hover:bg-gray-400 dark:hover:bg-gray-500'
      }`}
    >
      {children}
    </button>
));

const ActionButton: React.FC<{ onClick: () => void, title: string, children: React.ReactNode }> = React.memo(({ onClick, title, children }) => (
  <button
    onClick={onClick}
    title={title}
    className="p-2 rounded-md transition-colors bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-white hover:bg-gray-400 dark:hover:bg-gray-500"
  >
    {children}
  </button>
));

const PositioningToolbar: React.FC<PositioningToolbarProps> = ({ onReuseClick, pageTool, onToggleTool, onZoom, isLargeScreen }) => {
  const { t } = useLocale();

  const toolToggle = (
    <ToolButton
      isActive={pageTool === 'pan'}
      label={pageTool === 'select' ? t('pan') : t('select')}
      onClick={onToggleTool}
    >
      {pageTool === 'select' ? <PanIcon /> : <SelectIcon />}
    </ToolButton>
  );

  const tools = (
    <>
      <ActionButton onClick={onReuseClick} title={t('copyPositionFrom')}>
        <PasteIcon />
      </ActionButton>
      {toolToggle}
      <div className={`border-gray-400 dark:border-gray-600 ${isLargeScreen ? 'border-t w-full my-2' : 'border-l h-6 mx-2'}`}></div>
      <ActionButton onClick={() => onZoom(1.25)} title={t('zoomIn')}>
        <ZoomInIcon />
      </ActionButton>
      <ActionButton onClick={() => onZoom(0.8)} title={t('zoomOut')}>
        <ZoomOutIcon />
      </ActionButton>
    </>
  );

  if (isLargeScreen) {
    return (
      <div className="bg-gray-100 dark:bg-gray-800 p-2 rounded-xl grid grid-cols-1 gap-2 justify-items-center content-start shadow-inner">
        {tools}
      </div>
    );
  }

  return (
    <div className="bg-gray-100 dark:bg-gray-800 p-2 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center justify-center flex-wrap gap-2 shadow-inner">
      {tools}
    </div>
  );
};

export default React.memo(PositioningToolbar);
