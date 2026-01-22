
import React from 'react';
import KerningToolbar from '../KerningToolbar';
import LinkedGlyphsStrip from '../drawing/LinkedGlyphsStrip';
import { Character, GlyphData, AppSettings } from '../../types';

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
    
    // Source Strip Props
    sourceGlyphs: Character[];
    onSelectCharacter: (char: Character) => void;
    glyphDataMap: Map<number, GlyphData>;
    settings: AppSettings;
    allCharsByName: Map<string, Character>;
}

const KerningEditorWorkspace: React.FC<KerningEditorWorkspaceProps> = ({
    isLargeScreen, containerRef, onZoom, kernValue, onKernChange, onKernFocus, onKernHover, 
    isKernDirty, xDistValue, onXDistChange, onXDistCommit, isXDistFocused, isXDistHovered, 
    onXDistFocus, onXDistHover, xDistInputRef, children,
    sourceGlyphs, onSelectCharacter, glyphDataMap, settings, allCharsByName
}) => {
    return (
        <main className="flex-1 flex flex-col overflow-hidden bg-gray-100 dark:bg-gray-950/20 relative min-h-0 h-full w-full">
            <div className="flex-1 flex flex-col items-center w-full h-full overflow-hidden relative min-h-0">
                {/* Centering container */}
                <div 
                    ref={containerRef}
                    className="flex-1 w-full flex flex-col items-center justify-center min-h-0 relative px-4" 
                >
                    {/* 
                        Anchor container: This div wraps the children (the canvas card). 
                        By NOT using w-full here, right-full on the toolbar will anchor 
                        correctly to the side of the card.
                    */}
                    <div className="relative flex items-center justify-center">
                        {isLargeScreen && (
                            <div className="absolute right-full mr-6 top-6 z-30">
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
                        {children}
                    </div>
                </div>

                {!isLargeScreen && (
                    <div className="flex-shrink-0 w-full z-20 p-3 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex justify-center shadow-lg">
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
                
                <div className="w-full max-w-5xl mx-auto flex-shrink-0 z-20 px-2 pb-2">
                    <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-md rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                        <LinkedGlyphsStrip
                            title="Sources"
                            items={sourceGlyphs}
                            glyphDataMap={glyphDataMap}
                            settings={settings}
                            onSelect={onSelectCharacter}
                            variant="sources"
                            allCharsByName={allCharsByName}
                        />
                    </div>
                </div>
            </div>
        </main>
    );
};

export default React.memo(KerningEditorWorkspace);
