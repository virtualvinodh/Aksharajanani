
import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { Character, GlyphData, FontMetrics, AppSettings, RecommendedKerning, CharacterSet, ComponentTransform, Path } from '../types';
import KerningEditorHeader from './kerning/KerningEditorHeader';
import KerningEditorWorkspace from './kerning/KerningEditorWorkspace';
import KerningCanvas from './KerningCanvas';
import { useKerningSession } from '../hooks/kerning/useKerningSession';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { getAccurateGlyphBBox } from '../services/glyphRenderService';
import Modal from './Modal';
import { useLocale } from '../contexts/LocaleContext';
import { useProject } from '../contexts/ProjectContext';
import { useGlyphData as useGlyphDataContext } from '../contexts/GlyphDataContext';
import { useLayout } from '../contexts/LayoutContext';
import { useKerning } from '../contexts/KerningContext';

interface KerningEditorPageProps {
    pair: { left: Character, right: Character };
    onClose: () => void;
    onDelete: () => void;
    onSave: (value: number) => void;
    onRemove: () => void;
    initialValue: number;
    glyphDataMap: Map<number, GlyphData>;
    strokeThickness: number;
    metrics: FontMetrics;
    settings: AppSettings;
    recommendedKerning: RecommendedKerning[] | null;
    onNavigate: (target: 'prev' | 'next' | Character) => void;
    hasPrev: boolean;
    hasNext: boolean;
    glyphVersion: number;
    isKerned: boolean;
    allCharacterSets: CharacterSet[];
    onConvertToComposite?: (newTransforms: ComponentTransform[]) => void;
    allCharsByName: Map<string, Character>;
    character: Character; // The virtual/real character representing this pair
    showPropertiesButton?: boolean; // New optional prop
    onIgnore?: () => void;
    isIgnored?: boolean;
}

const KerningEditorPage: React.FC<KerningEditorPageProps> = (props) => {
    const { t } = useLocale();
    const isLargeScreen = useMediaQuery('(min-width: 1024px)');
    const xDistInputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isDetachConfirmOpen, setIsDetachConfirmOpen] = useState(false);

    // Initialize local state for metrics editing (even if virtual)
    const [lsb, setLsb] = useState<number | undefined>(props.character.lsb);
    const [rsb, setRsb] = useState<number | undefined>(props.character.rsb);

    // State for construction properties to pass down to header/panel
    const [position, setPosition] = useState<[string, string] | undefined>(props.character.position);
    const [kern, setKern] = useState<[string, string] | undefined>(props.character.kern);
    const [gpos, setGpos] = useState<string | undefined>(props.character.gpos);
    const [gsub, setGsub] = useState<string | undefined>(props.character.gsub);
    const [liga, setLiga] = useState<string[] | undefined>(props.character.liga);

    // Sync state if character changes
    useEffect(() => {
        setLsb(props.character.lsb);
        setRsb(props.character.rsb);
        setPosition(props.character.position);
        setKern(props.character.kern);
        setGpos(props.character.gpos);
        setGsub(props.character.gsub);
        setLiga(props.character.liga);
    }, [props.character]);


    const { showNotification } = useLayout();
    const { dispatch: characterDispatch } = useProject();
    const { dispatch: glyphDataDispatch } = useGlyphDataContext();
    const { kerningMap, dispatch: kerningDispatch } = useKerning();
    
    const onSaveConstruction = useCallback((type: 'drawing' | 'composite' | 'link' | 'positioning' | 'kerning', components: string[], transforms?: ComponentTransform[]) => {
        const { character } = props;
        if (!character.unicode) {
            showNotification("Cannot modify a character without a Unicode ID.", "error");
            return;
        }

        // Cleanup Kerning Map if removing 'kerning' type
        if (character.kern && type !== 'kerning') {
             const [l, r] = character.kern;
             const lc = props.allCharsByName.get(l);
             const rc = props.allCharsByName.get(r);
             if (lc?.unicode && rc?.unicode) {
                 const key = `${lc.unicode}-${rc.unicode}`;
                 if (kerningMap.has(key)) {
                     const nm = new Map(kerningMap);
                     nm.delete(key);
                     kerningDispatch({type: 'SET_MAP', payload: nm});
                 }
             }
        }
    
        characterDispatch({
            type: 'UPDATE_CHARACTER_SETS',
            payload: (prevSets: CharacterSet[] | null) => {
                if (!prevSets) return null;
                return prevSets.map(set => ({
                    ...set,
                    characters: set.characters.map(c => {
                        if (c.unicode === character.unicode) {
                            const updated: Character = { ...character };
                            // Clear all construction types
                            delete updated.kern;
                            delete updated.position;
                            delete updated.link;
                            delete updated.composite;
                            delete updated.compositeTransform;
    
                            // Set the new type
                            if (type === 'link') updated.link = components;
                            if (type === 'composite') {
                                updated.composite = components;
                                if (transforms) updated.compositeTransform = transforms;
                            }
                            if (type === 'positioning') updated.position = components as [string, string];
                            if (type === 'kerning') updated.kern = components as [string, string];
                            
                            return updated;
                        }
                        return c;
                    })
                }));
            }
        });
    
        // If changing to a virtual type, ensure any old drawing data is removed.
        if (type === 'positioning' || type === 'kerning') {
            glyphDataDispatch({ type: 'DELETE_GLYPH', payload: { unicode: character.unicode } });
        } 
        
        showNotification("Construction type changed. The editor will now update.", "success");
    
    }, [props, characterDispatch, glyphDataDispatch, showNotification, kerningMap, kerningDispatch]);

    const onPathsChange = useCallback((paths: Path[]) => {
        if (props.character.unicode && paths.length === 0) {
            glyphDataDispatch({ type: 'DELETE_GLYPH', payload: { unicode: props.character.unicode } });
        } else if (paths.length > 0) {
             showNotification("Path editing is not supported in the kerning editor.", "info");
        }
    }, [props.character.unicode, glyphDataDispatch, showNotification]);

    const session = useKerningSession(props);
    const sourceGlyphs = useMemo(() => [props.pair.left, props.pair.right], [props.pair]);

    const updateSize = useCallback(() => {
        const container = containerRef.current;
        if (!container) return;

        const w = container.offsetWidth;
        const h = container.offsetHeight;

        if (w > 0 && h > 0) {
            session.setContainerSize({ width: w, height: h });
        }
    }, [session.setContainerSize]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        updateSize();
        
        const ro = new ResizeObserver(() => {
            requestAnimationFrame(updateSize);
        });
        ro.observe(container);
        
        return () => ro.disconnect();
    }, [updateSize]);

    const handleZoomAction = useCallback((factor: number) => {
        const oldZoom = session.zoom;
        const newZoom = Math.max(0.1, Math.min(10, oldZoom * factor));
        const scaleRatio = newZoom / oldZoom;

        session.setViewOffset({
            x: session.viewOffset.x * scaleRatio,
            y: session.viewOffset.y * scaleRatio
        });
        session.setZoom(newZoom);
    }, [session]);
    
    const handleDetach = () => {
        if (!props.onConvertToComposite) return;

        // Calculate visual X shift
        const leftGlyph = props.glyphDataMap.get(props.pair.left.unicode!);
        const rightGlyph = props.glyphDataMap.get(props.pair.right.unicode!);
        
        if (leftGlyph && rightGlyph) {
             const lBox = getAccurateGlyphBBox(leftGlyph.paths, props.strokeThickness);
             const rBox = getAccurateGlyphBBox(rightGlyph.paths, props.strokeThickness);
             
             if (lBox && rBox) {
                const rsbL = props.pair.left.rsb ?? props.metrics.defaultRSB;
                const lsbR = props.pair.right.lsb ?? props.metrics.defaultLSB;
                const kernNum = parseInt(session.kernValue, 10) || 0;
                
                const rightTranslateX = lBox.x + lBox.width + rsbL + kernNum + lsbR - rBox.x;
                
                const transforms: ComponentTransform[] = [
                    { scale: 1, x: 0, y: 0, mode: 'relative' },
                    { scale: 1, x: rightTranslateX, y: 0, mode: 'absolute' }
                ];
                
                props.onConvertToComposite(transforms);
             }
        }
        setIsDetachConfirmOpen(false);
    };

    return (
        <div className="flex-1 flex flex-col h-full w-full bg-white dark:bg-gray-800 min-h-0 overflow-hidden">
            <KerningEditorHeader 
                pair={props.pair} 
                onClose={props.onClose}
                onDelete={props.onDelete}
                onNavigate={props.onNavigate} 
                hasPrev={props.hasPrev} 
                hasNext={props.hasNext} 
                onAutoKern={session.handleAutoKern} 
                isAutoKerning={session.isAutoKerning} 
                onSave={session.handleSave} 
                onRemove={props.onRemove} 
                isDirty={session.isDirty} 
                settings={props.settings} 
                isKerned={props.isKerned}
                allCharacterSets={props.allCharacterSets}
                character={props.character}
                onDetach={props.onConvertToComposite ? () => setIsDetachConfirmOpen(true) : undefined}
                onSaveConstruction={onSaveConstruction}
                characterDispatch={characterDispatch}
                glyphDataDispatch={glyphDataDispatch}
                onPathsChange={onPathsChange}
                lsb={lsb} setLsb={setLsb}
                rsb={rsb} setRsb={setRsb}
                metrics={props.metrics}
                showPropertiesButton={props.showPropertiesButton !== undefined ? props.showPropertiesButton : true}
                position={position} setPosition={setPosition}
                kern={kern} setKern={setKern}
                gpos={gpos} setGpos={setGpos}
                gsub={gsub} setGsub={setGsub}
                liga={liga} setLiga={setLiga}
                onIgnore={props.onIgnore!}
                isIgnored={!!props.isIgnored}
            />
            
            <KerningEditorWorkspace 
                isLargeScreen={isLargeScreen}
                containerRef={containerRef}
                onZoom={handleZoomAction} 
                kernValue={session.kernValue} 
                onKernChange={(e) => session.setKernValue(e.target.value)} 
                onKernFocus={session.setIsKernFocused} 
                onKernHover={session.setIsKernHovered} 
                isKernDirty={session.isDirty} 
                xDistValue={session.xDistValue} 
                onXDistChange={(e) => session.setXDistValue(e.target.value)} 
                onXDistCommit={session.handleXDistCommit} 
                isXDistFocused={session.isXDistFocused} 
                isXDistHovered={session.isXDistHovered} 
                onXDistFocus={session.setIsXDistFocused} 
                onXDistHover={session.setIsXDistHovered} 
                xDistInputRef={xDistInputRef} 
                sourceGlyphs={sourceGlyphs}
                onSelectCharacter={session.handleNavigationAttempt}
                glyphDataMap={props.glyphDataMap}
                settings={props.settings}
                allCharsByName={props.allCharsByName}
            >
                <div 
                    className="rounded-xl overflow-hidden shadow-2xl relative flex items-center justify-center bg-white dark:bg-gray-900 border-4 border-white dark:border-gray-800"
                    style={{ 
                        width: session.canvasDisplaySize.width || '80vw', 
                        height: session.canvasDisplaySize.height || '60vh'
                    }}
                >
                    <KerningCanvas
                        width={session.canvasDisplaySize.width || 800}
                        height={session.canvasDisplaySize.height || 533}
                        leftChar={props.pair.left}
                        rightChar={props.pair.right}
                        glyphDataMap={props.glyphDataMap}
                        kernValue={session.kernValue}
                        onKernChange={session.setKernValue}
                        metrics={props.metrics}
                        tool="select" 
                        zoom={session.zoom}
                        setZoom={session.setZoom}
                        viewOffset={session.viewOffset}
                        setViewOffset={session.setViewOffset}
                        settings={props.settings}
                        baseScale={session.baseScale}
                        strokeThickness={props.strokeThickness}
                        showMeasurement={session.showMeasurement}
                    />
                </div>
            </KerningEditorWorkspace>
            
            <Modal 
                isOpen={isDetachConfirmOpen} 
                onClose={() => setIsDetachConfirmOpen(false)} 
                title="Detach Pair?" 
                footer={<><button onClick={() => setIsDetachConfirmOpen(false)} className="px-4 py-2 bg-gray-500 text-white rounded">{t('cancel')}</button><button onClick={handleDetach} className="px-4 py-2 bg-indigo-600 text-white rounded">Detach & Edit</button></>}
            >
                <p>This will convert the kerning pair into a static ligature glyph. You will be able to edit the outlines manually.</p>
            </Modal>
        </div>
    );
};

export default React.memo(KerningEditorPage);
