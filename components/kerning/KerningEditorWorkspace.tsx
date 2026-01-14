import React from 'react';
import KerningToolbar from '../KerningToolbar';

interface KerningEditorWorkspaceProps {
    isLargeScreen: boolean;
    canvasRef: React.RefObject<HTMLCanvasElement>;
    containerRef: React.RefObject<HTMLDivElement>;
    onMouseDown: (e: React.MouseEvent) => void;
    onMouseMove: (e: React.MouseEvent) => void;
    onMouseUp: () => void;
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchMove: (e: React.TouchEvent) => void;
    
    // Toolbar Props
    onZoom: (factor: number) => void;
    kernValue: string;
    onKernChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onKernFocus: (focused: boolean) => void;
    onKernHover: (hovered: boolean) => void;
    isKernDirty: boolean;
    xDistValue: string;
    onXDistChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onXDistCommit: () => void;
    isXDistFocused: boolean;
    isXDistHovered: boolean;
    onXDistFocus: (focused: boolean) => void;
    onXDistHover: (hovered: boolean) => void;
    xDistInputRef: React.RefObject<HTMLInputElement>;
}

const KerningEditorWorkspace: React.FC<KerningEditorWorkspaceProps> = ({
    isLargeScreen, canvasRef, containerRef, onMouseDown, onMouseMove, onMouseUp, onTouchStart, onTouchMove,
    onZoom, kernValue, onKernChange, onKernFocus, onKernHover, isKernDirty, xDistValue, onXDistChange, onXDistCommit, isXDistFocused, isXDistHovered, onXDistFocus, onXDistHover, xDistInputRef
}) => {
    return (
        <main className="flex-grow flex flex-col overflow-hidden bg-gray-100 dark:bg-gray-950/20 relative">
            <div className="flex-1 flex flex-col items-center w-full h-full overflow-hidden relative">
                <div className="flex-1 w-full max-w-6xl flex flex-row items-center justify-center gap-3 min-h-0 relative px-4">
                    {/* Morphic Desktop Toolbar: Floating vertical dock */}
                    {isLargeScreen && (
                        <div className="absolute left-6 top-1/2 -translate-y-1/2 z-30 animate-fade-in-up">
                            <KerningToolbar 
                                orientation="vertical"
                                onZoom={onZoom}
                                kernValue={kernValue}
                                onKernChange={onKernChange}
                                onKernFocus={onKernFocus}
                                onKernHover={onKernHover}
                                isKernDirty={isKernDirty}
                                xDistValue={xDistValue}
                                onXDistChange={onXDistChange}
                                onXDistCommit={onXDistCommit}
                                isXDistFocused={isXDistFocused}
                                isXDistHovered={isXDistHovered}
                                onXDistFocus={onXDistFocus}
                                onXDistHover={onXDistHover}
                                xDistInputRef={xDistInputRef}
                            />
                        </div>
                    )}

                    {/* Standardized Hero Canvas Wrapper */}
                    <div 
                        className="aspect-square h-full max-h-full w-auto max-w-full bg-white dark:bg-gray-900 rounded-xl shadow-2xl overflow-hidden border-4 border-white dark:border-gray-800 relative transition-shadow duration-300 hover:shadow-indigo-500/10" 
                        ref={containerRef}
                    >
                        <canvas
                            ref={canvasRef}
                            className="w-full h-full cursor-ew-resize touch-none"
                            onMouseDown={onMouseDown}
                            onMouseMove={onMouseMove}
                            onMouseUp={onMouseUp}
                            onMouseLeave={onMouseUp}
                            onTouchStart={onTouchStart}
                            onTouchMove={onTouchMove}
                            onTouchEnd={onMouseUp}
                        />
                    </div>
                </div>

                {/* Mobile Toolbar: Ergonomic bottom dock */}
                {!isLargeScreen && (
                    <div className="flex-shrink-0 w-full z-20 p-3 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex justify-center shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
                        <KerningToolbar 
                            orientation="horizontal"
                            onZoom={onZoom}
                            kernValue={kernValue}
                            onKernChange={onKernChange}
                            onKernFocus={onKernFocus}
                            onKernHover={onKernHover}
                            isKernDirty={isKernDirty}
                            xDistValue={xDistValue}
                            onXDistChange={onXDistChange}
                            onXDistCommit={onXDistCommit}
                            isXDistFocused={isXDistFocused}
                            isXDistHovered={isXDistHovered}
                            onXDistFocus={onXDistFocus}
                            onXDistHover={onXDistHover}
                            xDistInputRef={xDistInputRef}
                        />
                    </div>
                )}
            </div>
        </main>
    );
};

export default React.memo(KerningEditorWorkspace);