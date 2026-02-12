import React, { useState, useRef, useEffect } from 'react';
import { Tool, AppSettings, Path, Character, TransformState } from '../types';
import { PenIcon, EraserIcon, LineIcon, CircleIcon, DotIcon, UndoIcon, RedoIcon, CurveIcon, SelectIcon, ZoomInIcon, ZoomOutIcon, PanIcon, ImageIcon, CutIcon, CopyIcon, PasteIcon, EllipseIcon, CalligraphyIcon, ImportIcon, GroupIcon, UngroupIcon, SliceIcon } from '../constants';
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

  onApplyTransform: (transform: TransformState & { flipX?: boolean; flipY?: boolean }) => void;
  previewTransform: TransformState | null;
  setPreviewTransform: (transform: TransformState | null) => void;
}

const ToolButton: React.FC<{ tool: Tool, currentTool: Tool, label: string, onClick: (tool: Tool) => void, children: React.ReactNode, disabled?: boolean, dataTour?: string }> = React.memo(({ tool, currentTool, label, onClick, children, disabled = false, dataTour }) => {
  const isActive = currentTool === tool;
  return (
    <button
      onClick={() => onClick(tool)}
      title={label}
      disabled={disabled}
      data-tour={dataTour}
      className={`p-2 rounded-lg transition-all shadow-sm ${
        isActive
          ? 'bg-indigo-600 text-white ring-2 ring-indigo-500/30'
          : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 border border-gray-200 dark:border-gray-600'
      } disabled:opacity-50 disabled:cursor-not-allowed active:scale-95`}
    >
      {/* Fix: Casting children to React.ReactElement with explicit prop type for cloneElement */}
      {React.cloneElement(children as React.ReactElement<{ className?: string }>, { className: 'w-5 h-5' })}
    </button>
  );
});

const ActionButton: React.FC<{ onClick: () => void, title: string, disabled?: boolean, children: React.ReactNode, dataTour?: string }> = React.memo(({ onClick, title, disabled, children, dataTour }) => (
  <button
    onClick={onClick}
    title={title}
    disabled={disabled}
    data-tour={dataTour}
    className="p-2 rounded-lg transition-all bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 border border-gray-200 dark:border-gray-600 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
  >
    {/* Fix: Casting children to React.ReactElement with explicit prop type for cloneElement */}
    {React.cloneElement(children as React.ReactElement<{ className?: string }>, { className: 'w-5 h-5' })}
  </button>
));

const DrawingToolbar: React.FC<DrawingToolbarProps> = (props) => {
    const { t } = useLocale();
    const { character, currentTool, setCurrentTool, settings, isLargeScreen, onUndo, canUndo, onRedo, canRedo, onCut, selectedPathIds, onCopy, onPaste, clipboard, onGroup, canGroup, onUngroup, canUngroup, onZoom, onImageImportClick, onSvgImportClick, calligraphyAngle, setCalligraphyAngle } = props;
    
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
    
    const commonTools = (
        <>
            <ToolButton tool="select" currentTool={currentTool} label="Select" onClick={setCurrentTool} dataTour="tool-select"><SelectIcon /></ToolButton>
            <ToolButton tool="pan" currentTool={currentTool} label={t('pan')} onClick={setCurrentTool} dataTour="tool-pan"><PanIcon /></ToolButton>
        </>
    );

    const drawingTools = (
        <>
            <ToolButton tool="pen" currentTool={currentTool} label="Pen" onClick={setCurrentTool} disabled={isLocked} dataTour="toolbar-pen"><PenIcon /></ToolButton>
            
            <div className="relative" ref={calligraphyToolButtonRef} data-tour="tool-calligraphy">
                <button
                    onClick={handleCalligraphyToolClick}
                    title="Calligraphy Pen"
                    disabled={isLocked}
                    className={`p-2 rounded-lg transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 ${
                    currentTool === 'calligraphy'
                        ? 'bg-indigo-600 text-white ring-2 ring-indigo-500/30'
                        : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 border border-gray-200 dark:border-gray-600'
                    }`}
                >
                    <CalligraphyIcon className="w-5 h-5" />
                     <div className={`absolute bottom-0.5 right-0.5 w-0 h-0 border-l-[4px] border-l-transparent border-b-[4px] ${currentTool === 'calligraphy' ? 'border-b-white' : 'border-b-gray-500 dark:border-b-gray-400'}`}></div>
                </button>
                {isAnglePickerOpen && (
                    <div className={`absolute z-50 bg-white dark:bg-gray-700 rounded-lg shadow-xl border border-gray-200 dark:border-gray-600 p-1 flex gap-1 animate-fade-in-up ${isLargeScreen ? 'left-full ml-2 top-0 flex-col' : 'bottom-full mb-2 left-1/2 -translate-x-1/2'}`}>
                        {[45, 30, 15].map((angle) => (
                            <button
                                key={angle}
                                onClick={() => { setCalligraphyAngle(angle as 45|30|15); setIsAnglePickerOpen(false); }}
                                className={`px-3 py-1 text-xs font-bold rounded-md w-full text-left transition-colors ${calligraphyAngle === angle ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600'}`}
                            >
                                {angle}°
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <ToolButton tool="line" currentTool={currentTool} label="Line" onClick={setCurrentTool} disabled={isLocked} dataTour="tool-line"><LineIcon /></ToolButton>
            <ToolButton tool="curve" currentTool={currentTool} label="Curve" onClick={setCurrentTool} disabled={isLocked}><CurveIcon /></ToolButton>
            <ToolButton tool="circle" currentTool={currentTool} label="Circle" onClick={setCurrentTool} disabled={isLocked}><CircleIcon /></ToolButton>
            <ToolButton tool="ellipse" currentTool={currentTool} label="Ellipse" onClick={setCurrentTool} disabled={isLocked}><EllipseIcon /></ToolButton>
            <ToolButton tool="dot" currentTool={currentTool} label="Dot" onClick={setCurrentTool} disabled={isLocked}><DotIcon /></ToolButton>
            
            <div className={`${isLargeScreen ? 'h-px w-full my-1.5 col-span-2' : 'hidden sm:block w-px h-6 mx-1'} bg-gray-300 dark:bg-gray-600`}></div>
            <ToolButton tool="eraser" currentTool={currentTool} label="Eraser" onClick={setCurrentTool} disabled={isLocked} dataTour="tool-eraser"><EraserIcon /></ToolButton>
            <ToolButton tool="slice" currentTool={currentTool} label="Slice" onClick={setCurrentTool} disabled={isLocked} dataTour="tool-slice"><SliceIcon /></ToolButton>
        </>
    );

    const actionTools = (
        <>
            <ActionButton onClick={onUndo} title="Undo" disabled={!canUndo} dataTour="action-undo"><UndoIcon /></ActionButton>
            <ActionButton onClick={onRedo} title="Redo" disabled={!canRedo} dataTour="action-redo"><RedoIcon /></ActionButton>
            <div className={`${isLargeScreen ? 'h-px w-full my-1.5 col-span-2' : 'hidden sm:block w-px h-6 mx-1'} bg-gray-300 dark:bg-gray-600`}></div>
            <ActionButton onClick={onCut} title={t('cut')} disabled={selectedPathIds.size === 0 || isLocked} dataTour="action-cut"><CutIcon /></ActionButton>
            <ActionButton onClick={onCopy} title={t('copy')} disabled={isLocked} dataTour="action-copy"><CopyIcon /></ActionButton>
            <ActionButton onClick={onPaste} title={t('paste')} disabled={!clipboard || isLocked} dataTour="action-paste"><PasteIcon /></ActionButton>
            <ActionButton onClick={onGroup} title={t('group')} disabled={!canGroup || isLocked} dataTour="action-group"><GroupIcon /></ActionButton>
            <ActionButton onClick={onUngroup} title={t('ungroup')} disabled={!canUngroup || isLocked} dataTour="action-ungroup"><UngroupIcon /></ActionButton>
            <div className={`${isLargeScreen ? 'h-px w-full my-1.5 col-span-2' : 'hidden sm:block w-px h-6 mx-1'} bg-gray-300 dark:bg-gray-600`}></div>
            <ActionButton onClick={() => onZoom(1.25)} title={t('zoomIn')}><ZoomInIcon /></ActionButton>
            <ActionButton onClick={() => onZoom(0.8)} title={t('zoomOut')}><ZoomOutIcon /></ActionButton>
            <div className={`${isLargeScreen ? 'h-px w-full my-1.5 col-span-2' : 'hidden sm:block w-px h-6 mx-1'} bg-gray-300 dark:bg-gray-600`}></div>
            <ActionButton onClick={onImageImportClick} title={t('importGuide')}><ImageIcon/></ActionButton>
            <ActionButton onClick={onSvgImportClick} title={t('importSvg')} disabled={isLocked}><ImportIcon/></ActionButton>
        </>
    );

    if(isLargeScreen) {
        return (
            <div data-tour="main-toolbar" className="bg-white/95 dark:bg-gray-800/95 backdrop-blur-md p-2 rounded-2xl grid grid-cols-2 gap-1.5 justify-items-center content-start shadow-2xl border border-gray-200 dark:border-gray-700 max-h-full overflow-y-auto no-scrollbar w-24">
                 {commonTools}
                 <div className="h-px w-full my-1 col-span-2 bg-gray-300 dark:bg-gray-600"></div>
                 {drawingTools}
                 <div className="h-px w-full my-1 col-span-2 bg-gray-300 dark:bg-gray-600"></div>
                 {actionTools}
            </div>
        );
    }

    return (
        <div data-tour="main-toolbar" className="bg-white/95 dark:bg-gray-800/95 backdrop-blur-md p-2 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl w-full sm:w-auto max-w-[95vw]">
             <div className="flex flex-wrap items-center justify-center gap-2">
                {commonTools}
                <div className="hidden sm:block w-px h-6 mx-1 bg-gray-300 dark:bg-gray-600"></div>
                {drawingTools}
                <div className="hidden sm:block w-px h-6 mx-1 bg-gray-300 dark:bg-gray-600"></div>
                {actionTools}
             </div>
        </div>
    );
};

export default React.memo(DrawingToolbar);