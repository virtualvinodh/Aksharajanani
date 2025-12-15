
import React from 'react';
import CombinationCard from '../CombinationCard';
import { Character, GlyphData, MarkAttachmentRules, MarkPositioningMap, CharacterSet } from '../../types';
import { CopyIcon, CheckCircleIcon, UndoIcon } from '../../constants';
import { useLocale } from '../../contexts/LocaleContext';

interface PositioningGridViewProps {
    displayedCombinations: { base: Character, mark: Character, ligature: Character }[];
    markPositioningMap: MarkPositioningMap;
    glyphDataMap: Map<number, GlyphData>;
    strokeThickness: number;
    markAttachmentRules: MarkAttachmentRules | null;
    characterSets: CharacterSet[];
    glyphVersion: number;
    groups: Record<string, string[]>;
    setEditingPair: (pair: any) => void;
    setEditingIndex: (index: number) => void;
    setEditingContextList: (list: any[]) => void;
    handleConfirmPosition: (base: Character, mark: Character, ligature: Character) => void;
    cardRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
    
    // For Header Actions integrated into the view (if filtering active or showing single item)
    activeItem?: Character;
    isFiltered: boolean;
    viewMode: 'base' | 'mark';
    
    handleOpenReuseModal: (item: Character) => void;
    handleAcceptAllDefaults: () => void;
    unpositionedCount: number;
    setIsResetConfirmOpen: (isOpen: boolean) => void;
    hasManuallyPositioned: boolean;
    
    // Empty state handling
    navItemsLength: number;
    t: (key: string, replacements?: any) => string;
}

const PositioningGridView: React.FC<PositioningGridViewProps> = ({
    displayedCombinations, markPositioningMap, glyphDataMap, strokeThickness,
    markAttachmentRules, characterSets, glyphVersion, groups,
    setEditingPair, setEditingIndex, setEditingContextList, handleConfirmPosition, cardRefs,
    activeItem, isFiltered, viewMode, handleOpenReuseModal, handleAcceptAllDefaults,
    unpositionedCount, setIsResetConfirmOpen, hasManuallyPositioned, navItemsLength, t
}) => {

    if ((!isFiltered && navItemsLength === 0) || (isFiltered && displayedCombinations.length === 0)) {
        return (
            <div className="text-center p-8 bg-gray-100 dark:bg-gray-800 rounded-lg">
                <p className="text-gray-600 dark:text-gray-400">
                    {isFiltered ? t('noResultsFound') : (viewMode === 'base' ? t('positioningNoBasesDrawn') : t('positioningNoMarksDrawn'))}
                </p>
            </div>
        );
    }

    if (!activeItem && !isFiltered && displayedCombinations.length === 0) return null;

    return (
        <div key={activeItem?.unicode || 'flat-list'}>
            <div className="flex items-center gap-4 mb-4 flex-wrap">
                {!isFiltered && activeItem && (
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200" style={{ fontFamily: 'var(--guide-font-family)', fontFeatureSettings: 'var(--guide-font-feature-settings)' }}>
                        {t('combinationsFor', { item: activeItem.name })}
                    </h2>
                )}
                {!isFiltered && activeItem && (
                    <button
                        onClick={() => handleOpenReuseModal(activeItem)}
                        title={t('copyPositionFrom')}
                        className="p-2 text-gray-400 hover:text-indigo-500 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                    >
                        <CopyIcon />
                    </button>
                )}
                <button
                    onClick={handleAcceptAllDefaults}
                    disabled={unpositionedCount === 0}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm bg-green-600 text-white font-semibold rounded-md hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                    <CheckCircleIcon className="h-4 w-4" />
                    {t('acceptAllDefaults')}
                </button>
                <button
                    onClick={() => setIsResetConfirmOpen(true)}
                    disabled={!hasManuallyPositioned}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm bg-yellow-600 text-white font-semibold rounded-md hover:bg-yellow-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                    <UndoIcon />
                    {t('resetPositions')}
                </button>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-4">
                {displayedCombinations.map(({ base, mark, ligature }, index) => {
                    const isPositioned = markPositioningMap.has(`${base.unicode}-${mark.unicode}`);
                    const pairId = `${base.unicode}-${mark.unicode}`;
                    return (
                        <CombinationCard
                            key={ligature.unicode}
                            ref={(el) => { if (el) cardRefs.current.set(pairId, el); else cardRefs.current.delete(pairId); }}
                            baseChar={base}
                            markChar={mark}
                            ligature={ligature}
                            glyphDataMap={glyphDataMap}
                            strokeThickness={strokeThickness}
                            isPositioned={isPositioned}
                            canEdit={true}
                            onClick={() => {
                                setEditingPair({ base, mark, ligature });
                                setEditingIndex(index);
                                setEditingContextList(displayedCombinations);
                            }}
                            onConfirmPosition={() => handleConfirmPosition(base, mark, ligature)}
                            markAttachmentRules={markAttachmentRules}
                            markPositioningMap={markPositioningMap}
                            characterSets={characterSets!}
                            glyphVersion={glyphVersion}
                            groups={groups}
                        />
                    );
                })}
            </div>
        </div>
    );
};

export default React.memo(PositioningGridView);
