import React, { useState, useRef, useEffect } from 'react';
import { Tool, AppSettings, Path, Character } from '../types';
import { PenIcon, EraserIcon, LineIcon, CircleIcon, DotIcon, UndoIcon, RedoIcon, CurveIcon, SelectIcon, ZoomInIcon, ZoomOutIcon, PanIcon, ImageIcon, ControlPointsIcon, CutIcon, CopyIcon, PasteIcon, EllipseIcon, CalligraphyIcon, SvgIcon, SparklesIcon, ImportIcon, LinkIcon, BrokenLinkIcon, GroupIcon, UngroupIcon } from '../constants';
import { useLocale } from '../contexts/LocaleContext';

interface DrawingToolbarProps {
  character: Character;
  currentTool: Tool;
  setCurrentTool: (tool: Tool) => void;
  settings: AppSettings;
  isLargeScreen: boolean;
  
  onUndo: () => void;
  canUndo: boolean;
  onRedo: () => void;
  canRedo: boolean;
  
  onCut: () => void;
  selectedPathIds: Set<string>;
  onCopy: () => void;
  onPaste: () => void;
  clipboard: Path[] | null;
  onGroup: () => void;
  canGroup: boolean;
  onUngroup: () => void;
  canUngroup: boolean;
  
  onZoom: (factor: number) => void;
  onImageImportClick: () => void;
  onSvgImportClick: () => void;
  onImageTraceClick: () => void;
  
  calligraphyAngle: 45 | 30 | 15;
  setCalligraphyAngle: (angle: 45 | 30 | 15) => void;

  onUnlockClick: () => void;
  onRelinkClick: () => void;
}

const ToolButton: React.FC<{ tool: Tool, currentTool: Tool, label: string, onClick: (tool: Tool) => void, children: React.ReactNode, disabled?: boolean }> = React.memo(({ tool, currentTool, label, onClick, children, disabled = false }) => {
  const isActive = currentTool === tool;
  return (
    <button
      onClick={() => onClick(tool)}
      title={label}
      disabled={disabled}
      className={`p-2 rounded-md transition-colors ${
        isActive
          ? 'bg-indigo-600 text-white'
          : 'bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-white hover:bg-gray-400 dark:hover:bg-gray-500'
      } disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  );
});

const ActionButton: React.FC<{ onClick: () => void, title: string, disabled?: boolean, children: React.ReactNode }> = React.memo(({ onClick, title, disabled, children }) => (
  <button
    onClick={onClick}
    title={title}
    disabled={disabled}
    className="p-2 rounded-md transition-colors bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-white hover:bg-gray-400 dark:hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
  >
    {children}
  </button>
));


const DrawingToolbar: React.FC<DrawingToolbarProps> = (props) => {
    const { t } = useLocale();
    const { character, currentTool, setCurrentTool, settings, isLargeScreen, onUndo, canUndo, onRedo, canRedo, onCut, selectedPathIds, onCopy, onPaste, clipboard, onGroup, canGroup, onUngroup, canUngroup, onZoom, onImageImportClick, onSvgImportClick, onImageTraceClick, calligraphyAngle, setCalligraphyAngle, onUnlockClick, onRelinkClick } = props;
    
    const [isAnglePickerOpen, setIsAnglePickerOpen] = useState(false);
    const calligraphyToolButtonRef = useRef<HTMLDivElement>(null);
    const isLocked = !!character.link;


    useEffect(() => {
        if (currentTool !== 'calligraphy') {
            setIsAnglePickerOpen(false);
        }
    }, [currentTool]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (isAnglePickerOpen && calligraphyToolButtonRef.current && !calligraphyToolButtonRef.current.contains(event.target as Node)) {
                setIsAnglePickerOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isAnglePickerOpen]);

    const handleCalligraphyToolClick = () => {
        if (currentTool === 'calligraphy') {
            setIsAnglePickerOpen(prev => !prev);
        } else {
            setCurrentTool('calligraphy');
            setIsAnglePickerOpen(false);
        }
    };
    
    const lockOrLinkButton = character.link ? (
      <>
        <div className={`border-gray-400 dark:border-gray-600 ${isLargeScreen ? 'border-t w-full my-2' : 'border-l h-6 mx-2'}`}></div>
         <button
            onClick={onUnlockClick}
            title={t('unlockForDetailedEditing')}
            className="p-2 rounded-md transition-colors bg-orange-500 text-white hover:bg-orange-600 flex items-center gap-1"
        >
            <BrokenLinkIcon />
            <span className="text-xs font-bold sm:hidden">{t('unlock')}</span>
        </button>
      </>
    ) : character.sourceLink ? (
      <>
        <div className={`border-gray-400 dark:border-gray-600 ${isLargeScreen ? 'border-t w-full my-2' : 'border-l h-6 mx-2'}`}></div>
         <button
            onClick={onRelinkClick}
            title={t('relinkGlyphTitle')}
            className="p-2 rounded-md transition-colors bg-blue-500 text-white hover:bg-blue-600 flex items-center gap-1"
        >
            <LinkIcon />
            <span className="text-xs font-bold sm:hidden">{t('relink')}</span>
        </button>
      </>
    ) : null;

    const commonTools = (
        <>
            <ToolButton tool="select" currentTool={currentTool} label="Select" onClick={setCurrentTool}><SelectIcon /></ToolButton>
            <ToolButton tool="pan" currentTool={currentTool} label={t('pan')} onClick={setCurrentTool}><PanIcon /></ToolButton>
            {settings.editorMode === 'advanced' && <ToolButton tool="edit" currentTool={currentTool} label={t('showControlPoints')} onClick={setCurrentTool} disabled={isLocked}><ControlPointsIcon /></ToolButton>}
            {lockOrLinkButton}
        </>
    );

    const drawingTools = (
        <>
            <ToolButton tool="pen" currentTool={currentTool} label="Pen" onClick={setCurrentTool} disabled={isLocked}><PenIcon /></ToolButton>
            {settings.editorMode === 'advanced' && (
                <div className="relative" ref={calligraphyToolButtonRef}>
                    <button
                        onClick={handleCalligraphyToolClick}
                        title="Calligraphy Pen"
                        disabled={isLocked}
                        className={`p-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                        currentTool === 'calligraphy'
                            ? 'bg-indigo-600 text-white'
                            : 'bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-white hover:bg-gray-400 dark:hover:bg-gray-500'
                        }`}
                    >
                        <CalligraphyIcon />
                    </button>
                    {isAnglePickerOpen && (
                        <div className={`absolute z-10 bg-white dark:bg-gray-700 rounded-md shadow-lg border dark:border-gray-600 p-1 flex gap-1 ${isLargeScreen ? 'left-full ml-2 top-0 flex-col' : 'bottom-full mb-2 left-1/2 -translate-x-1/2'}`}>
                            {[45, 30, 15].map((angle) => (
                                <button
                                    key={angle}
                                    onClick={() => { setCalligraphyAngle(angle as 45|30|15); setIsAnglePickerOpen(false); }}
                                    className={`px-3 py-1 text-sm rounded-md w-full text-left ${calligraphyAngle === angle ? 'bg-indigo-500 text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-600'}`}
                                >
                                    {angle}°
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
            <ToolButton tool="line" currentTool={currentTool} label="Line" onClick={setCurrentTool} disabled={isLocked}><LineIcon /></ToolButton>
            <ToolButton tool="circle" currentTool={currentTool} label="Circle" onClick={setCurrentTool} disabled={isLocked}><CircleIcon /></ToolButton>
            <ToolButton tool="ellipse" currentTool={currentTool} label="Ellipse" onClick={setCurrentTool} disabled={isLocked}><EllipseIcon /></ToolButton>
            <ToolButton tool="curve" currentTool={currentTool} label="Curve" onClick={setCurrentTool} disabled={isLocked}><CurveIcon /></ToolButton>
            <ToolButton tool="dot" currentTool={currentTool} label="Dot" onClick={setCurrentTool} disabled={isLocked}><DotIcon /></ToolButton>
            <div className={`border-gray-400 dark:border-gray-600 ${isLargeScreen ? 'border-t w-full my-2' : 'border-l h-6 mx-2'}`}></div>
            <ToolButton tool="eraser" currentTool={currentTool} label="Eraser" onClick={setCurrentTool} disabled={isLocked}><EraserIcon /></ToolButton>
        </>
    );

    const actionTools = (
        <>
            <ActionButton onClick={onUndo} title="Undo" disabled={!canUndo}><UndoIcon /></ActionButton>
            <ActionButton onClick={onRedo} title="Redo" disabled={!canRedo}><RedoIcon /></ActionButton>
            <div className={`border-gray-400 dark:border-gray-600 ${isLargeScreen ? 'border-t w-full my-2' : 'border-l h-6 mx-2'}`}></div>
            <ActionButton onClick={onCut} title={t('cut')} disabled={selectedPathIds.size === 0 || isLocked}><CutIcon /></ActionButton>
            <ActionButton onClick={onCopy} title={t('copy')} disabled={isLocked}><CopyIcon /></ActionButton>
            <ActionButton onClick={onPaste} title={t('paste')} disabled={!clipboard || isLocked}><PasteIcon /></ActionButton>
            <ActionButton onClick={onGroup} title={t('group')} disabled={!canGroup || isLocked}><GroupIcon /></ActionButton>
            <ActionButton onClick={onUngroup} title={t('ungroup')} disabled={!canUngroup || isLocked}><UngroupIcon /></ActionButton>
            <div className={`border-gray-400 dark:border-gray-600 ${isLargeScreen ? 'border-t w-full my-2' : 'border-l h-6 mx-2'}`}></div>
            <ActionButton onClick={() => onZoom(1.25)} title={t('zoomIn')}><ZoomInIcon /></ActionButton>
            <ActionButton onClick={() => onZoom(0.8)} title={t('zoomOut')}><ZoomOutIcon /></ActionButton>
            <div className={`border-gray-400 dark:border-gray-600 ${isLargeScreen ? 'border-t w-full my-2' : 'border-l h-6 mx-2'}`}></div>
            <ActionButton onClick={onImageImportClick} title={t('importGuide')}><ImageIcon/></ActionButton>
            <ActionButton onClick={onImageTraceClick} title={t('traceImage')} disabled={isLocked}><SparklesIcon/></ActionButton>
            <ActionButton onClick={onSvgImportClick} title={t('importSvg')} disabled={isLocked}><ImportIcon/></ActionButton>
        </>
    );

    if(isLargeScreen) {
        return (
            <div className="bg-gray-100 dark:bg-gray-800 p-2 rounded-l-lg flex flex-row items-start justify-center gap-2 shadow-inner">
                <div className="flex flex-col items-center justify-center gap-2">
                    {commonTools}
                    <div className="border-t w-full border-gray-400 dark:border-gray-600 my-2"></div>
                    {drawingTools}
                </div>
                <div className="flex flex-col items-center justify-center gap-2">
                    {actionTools}
                </div>
            </div>
        );
    }

    return (
        <div className="bg-gray-100 dark:bg-gray-800 p-2 rounded-t-lg flex items-center justify-center flex-wrap gap-2 shadow-inner">
            {commonTools}
            <div className="border-l h-6 border-gray-400 dark:border-gray-600 mx-2"></div>
            {drawingTools}
            <div className="border-l h-6 border-gray-400 dark:border-gray-600 mx-2"></div>
            {actionTools}
        </div>
    );
};

export default React.memo(DrawingToolbar);