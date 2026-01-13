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
    onZoom, kernValue, onKernChange, isKernDirty, xDistValue, onXDistChange, onXDistCommit, isXDistFocused, isXDistHovered, onXDistFocus, onXDistHover, xDistInputRef
}) => {
    return (
        <main className="flex-grow flex flex-col overflow-hidden bg-gray-100 dark:bg-gray-900 relative">
            <div className="flex-1 flex flex-col items-center w-full h-full p-2 sm:p-4 overflow-hidden">
                <div className="flex-1 w-full max-w-5xl flex flex-row items-center justify-center gap-3 min-h-0 relative">
                    {/* Desktop Toolbar */}
                    {isLargeScreen && (
                        <div className="flex-shrink-0 z-20">
                            <KerningToolbar 
                                orientation="vertical"
                                onZoom={onZoom}
                                kernValue={kernValue}
                                onKernChange={onKernChange}
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

                    <div className="aspect-square h-full max-h-full w-auto max-w-full bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden border border-gray-200 dark:border-gray-700 relative" ref={containerRef}>
                        <canvas
                            ref={canvasRef}
                            className="w-full h-full cursor-ew-resize"
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

                {/* Mobile Toolbar */}
                {!isLargeScreen && (
                    <div className="flex-shrink-0 w-full max-w-5xl z-20 mt-3 flex justify-center">
                        <KerningToolbar 
                            orientation="horizontal"
                            onZoom={onZoom}
                            kernValue={kernValue}
                            onKernChange={onKernChange}
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