import React from 'react';
import { useLocale } from '../contexts/LocaleContext';
import { ZoomInIcon, ZoomOutIcon } from '../constants';

interface KerningToolbarProps {
    orientation?: 'vertical' | 'horizontal';
    onZoom: (factor: number) => void;
    
    // Kerning Input Props
    kernValue: string;
    onKernChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    isKernDirty: boolean;

    // X-Dist Input Props
    xDistValue: string;
    onXDistChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onXDistCommit: () => void;
    isXDistFocused: boolean;
    isXDistHovered: boolean;
    onXDistFocus: (focused: boolean) => void;
    onXDistHover: (hovered: boolean) => void;
    xDistInputRef: React.RefObject<HTMLInputElement>;
}

const KerningToolbar: React.FC<KerningToolbarProps> = ({
    orientation = 'vertical', onZoom, 
    kernValue, onKernChange, isKernDirty,
    xDistValue, onXDistChange, onXDistCommit, isXDistFocused, isXDistHovered, onXDistFocus, onXDistHover, xDistInputRef
}) => {
    const { t } = useLocale();
    const isVertical = orientation === 'vertical';

    const ActionButton: React.FC<{ onClick: () => void, title: string, children: React.ReactNode }> = ({ onClick, title, children }) => (
        <button
            onClick={onClick}
            title={title}
            className="p-2 rounded-lg transition-all bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 border border-gray-200 dark:border-gray-600 shadow-sm"
        >
            {children}
        </button>
    );

    return (
        <div className={`flex ${isVertical ? 'flex-col' : 'flex-row'} gap-3 p-2 bg-gray-100/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg items-center`}>
            {/* Zoom Controls */}
            <div className={`flex ${isVertical ? 'flex-col' : 'flex-row'} gap-2`}>
                <ActionButton onClick={() => onZoom(1.25)} title={t('zoomIn')}>
                    <ZoomInIcon />
                </ActionButton>
                <ActionButton onClick={() => onZoom(0.8)} title={t('zoomOut')}>
                    <ZoomOutIcon />
                </ActionButton>
            </div>

            <div className={`${isVertical ? 'h-px w-full my-0.5' : 'w-px h-8 mx-0.5'} bg-gray-300 dark:bg-gray-600`}></div>

            {/* Kerning/Spacing Input */}
            <div className="flex flex-col items-center gap-0.5">
                <label className="text-[9px] font-black text-gray-400 uppercase leading-none">Kern</label>
                <div className="relative">
                    <input
                        type="text"
                        value={kernValue}
                        onChange={onKernChange}
                        className="w-12 p-1.5 border rounded bg-white dark:bg-gray-900 dark:border-gray-600 font-mono text-center text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                    {isKernDirty && (
                        <span className="absolute -top-1 -right-1 flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500"></span>
                        </span>
                    )}
                </div>
            </div>

            {/* X-Distance Input */}
            <div className="flex flex-col items-center gap-0.5">
                <label className="text-[9px] font-black text-gray-400 uppercase leading-none">X-Dist</label>
                <input
                    ref={xDistInputRef}
                    type="text"
                    value={xDistValue}
                    onChange={onXDistChange}
                    onBlur={() => {
                        onXDistCommit();
                        onXDistFocus(false);
                    }}
                    onFocus={() => onXDistFocus(true)}
                    onMouseEnter={() => onXDistHover(true)}
                    onMouseLeave={() => onXDistHover(false)}
                    onKeyDown={e => e.key === 'Enter' && xDistInputRef.current?.blur()}
                    className={`w-12 p-1.5 border rounded bg-white dark:bg-gray-900 font-mono text-center text-xs transition-colors focus:outline-none ${isXDistFocused ? 'border-teal-500 ring-2 ring-teal-500' : 'dark:border-gray-600'}`}
                />
            </div>
        </div>
    );
};

export default React.memo(KerningToolbar);