import React from 'react';
import KerningToolbar from '../KerningToolbar';

interface KerningEditorWorkspaceProps {
    isLargeScreen: boolean;
    containerRef: React.RefObject<HTMLDivElement>;
    onZoom: (factor: number) => void;
    
    // Toolbar Props
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
    children?: React.ReactNode;
}

const KerningEditorWorkspace: React.FC<KerningEditorWorkspaceProps> = ({
    isLargeScreen, containerRef, onZoom, kernValue, onKernChange, onKernFocus, onKernHover, 
    isKernDirty, xDistValue, onXDistChange, onXDistCommit, isXDistFocused, isXDistHovered, 
    onXDistFocus, onXDistHover, xDistInputRef, children
}) => {
    return (
        <main className="flex-grow flex flex-col overflow-hidden bg-gray-100 dark:bg-gray-950/20 relative">
            <div className="flex-1 flex flex-col items-center w-full h-full overflow-hidden relative">
                <div className="flex-1 w-full flex flex-col items-center justify-center min-h-0 relative px-4" ref={containerRef}>
                    
                    {/* 
                      Centering Wrapper:
                      This container centers the entire workspace content within the available area.
                    */}
                    <div className="flex items-center justify-center h-full max-w-full">
                        
                        {/* 
                           Morphic Content Wrapper:
                           This relative div wraps the canvas container. 
                           Placing the absolute toolbar here ensures 'top-0' is the top of the canvas.
                        */}
                        <div className="relative">
                            {isLargeScreen && (
                                <div className="absolute right-full mr-6 top-0 z-30 animate-fade-in-up">
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

                            {/* Standardized Hero Canvas Area (Passed as children from Page) */}
                            {children}
                        </div>
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