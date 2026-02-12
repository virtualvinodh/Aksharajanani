
import React, { forwardRef } from 'react';
import CombinationCard from '../CombinationCard';
import { Character, GlyphData, MarkAttachmentRules, MarkPositioningMap, CharacterSet, AttachmentClass, PositioningRules } from '../../types';
import { PasteIcon, CheckCircleIcon, UndoIcon, LinkIcon } from '../../constants';
import { useLocale } from '../../contexts/LocaleContext';
import { expandMembers } from '../../services/groupExpansionService';
import { VirtuosoGrid } from 'react-virtuoso';

interface PositioningGridViewProps {
    displayedCombinations: { base: Character, mark: Character, ligature: Character }[];
    markPositioningMap: MarkPositioningMap;
    glyphDataMap: Map<number, GlyphData>;
    strokeThickness: number;
    markAttachmentRules: MarkAttachmentRules | null;
    positioningRules: PositioningRules[] | null;
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

    // Added Props for Class Logic
    markAttachmentClasses: AttachmentClass[] | null;
    baseAttachmentClasses: AttachmentClass[] | null;
}

const CrownIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" clipRule="evenodd" />
    </svg>
);

interface ClassStatus {
    status: 'representative' | 'sibling' | 'unlinked' | 'none';
    representativeLabel?: string;
    classType?: 'mark' | 'base';
}

const ListContainer = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>((props, ref) => (
    <div
      {...props}
      ref={ref}
      className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-4 px-6 pb-20 pt-10"
    />
));

const ItemContainer = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>((props, ref) => (
    <div {...props} ref={ref} className="min-w-0 w-full" />
));

const PositioningGridView: React.FC<PositioningGridViewProps> = ({
    displayedCombinations, markPositioningMap, glyphDataMap, strokeThickness,
    markAttachmentRules, positioningRules, characterSets, glyphVersion, groups,
    setEditingPair, setEditingIndex, setEditingContextList, handleConfirmPosition, cardRefs,
    activeItem, isFiltered, viewMode, handleOpenReuseModal, handleAcceptAllDefaults,
    unpositionedCount, setIsResetConfirmOpen, hasManuallyPositioned, navItemsLength, t,
    markAttachmentClasses, baseAttachmentClasses
}) => {

    const getClassStatus = (base: Character, mark: Character): ClassStatus => {
         const pairKey = `${base.name}-${mark.name}`;

         // Check Mark Classes
         if (markAttachmentClasses) {
            const mClass = markAttachmentClasses.find(c => expandMembers(c.members, groups, characterSets).includes(mark.name));
            if (mClass) {
                // Check if this class actually applies to this base
                let applies = true;
                if (mClass.applies && mClass.applies.length > 0 && !expandMembers(mClass.applies, groups, characterSets).includes(base.name)) applies = false;
                if (mClass.exceptions && expandMembers(mClass.exceptions, groups, characterSets).includes(base.name)) applies = false;
                
                if (applies) {
                     if (mClass.exceptPairs?.includes(pairKey)) return { status: 'unlinked' };
                     
                     const members = expandMembers(mClass.members, groups, characterSets);
                     
                     // --- DYNAMIC LEADER IDENTIFICATION ---
                     // The leader is the first member that IS NOT an exception for this specific base
                     const effectiveLeaderMark = members.find(memberName => {
                         const pk = `${base.name}-${memberName}`;
                         return !mClass.exceptPairs?.includes(pk);
                     }) || members[0];
                     
                     if (effectiveLeaderMark === mark.name) return { status: 'representative', classType: 'mark' };
                     
                     return { 
                         status: 'sibling', 
                         classType: 'mark',
                         representativeLabel: `${base.name} + ${effectiveLeaderMark}`
                     };
                }
            }
         }

         // Check Base Classes
         if (baseAttachmentClasses) {
            const bClass = baseAttachmentClasses.find(c => expandMembers(c.members, groups, characterSets).includes(base.name));
            if (bClass) {
                let applies = true;
                if (bClass.applies && bClass.applies.length > 0 && !expandMembers(bClass.applies, groups, characterSets).includes(mark.name)) applies = false;
                if (bClass.exceptions && expandMembers(bClass.exceptions, groups, characterSets).includes(mark.name)) applies = false;
                
                if (applies) {
                    if (bClass.exceptPairs?.includes(pairKey)) return { status: 'unlinked' };
                    
                    const members = expandMembers(bClass.members, groups, characterSets);
                    
                    // --- DYNAMIC LEADER IDENTIFICATION ---
                    const effectiveLeaderBase = members.find(memberName => {
                        const pk = `${memberName}-${mark.name}`;
                        return !bClass.exceptPairs?.includes(pk);
                    }) || members[0];
                    
                    if (effectiveLeaderBase === base.name) return { status: 'representative', classType: 'base' };
                    
                    return {
                        status: 'sibling',
                        classType: 'base',
                        representativeLabel: `${effectiveLeaderBase} + ${mark.name}`
                    };
                }
            }
         }
         return { status: 'none' };
    };

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
        <div className="flex flex-col h-full" key={activeItem?.unicode || 'flat-list'}>
            <div className="flex-shrink-0 flex items-center gap-4 mb-4 flex-wrap">
                {!isFiltered && activeItem && (
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200" style={{ fontFamily: 'var(--guide-font-family)', fontFeatureSettings: 'var(--guide-font-feature-settings)' }}>
                        {t('combinationsFor', { item: activeItem.name })}
                    </h2>
                )}
                {!isFiltered && activeItem && (
                    <button
                        onClick={() => handleOpenReuseModal(activeItem)}
                        title={t('bulkCopyFrom')}
                        className="p-2 text-gray-400 hover:text-indigo-500 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                    >
                        <PasteIcon />
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

            <div className="flex-grow min-h-0">
                <VirtuosoGrid
                    style={{ height: '100%' }}
                    totalCount={displayedCombinations.length}
                    components={{
                        List: ListContainer,
                        Item: ItemContainer
                    }}
                    itemContent={(index) => {
                        const { base, mark, ligature } = displayedCombinations[index];
                        const isPositioned = markPositioningMap.has(`${base.unicode}-${mark.unicode}`);
                        const pairId = `${base.unicode}-${mark.unicode}`;
                        const { status, representativeLabel, classType } = getClassStatus(base, mark);
                        
                        return (
                            <div key={ligature.unicode} className={`relative ${status === 'representative' ? 'z-10' : ''}`}>
                                 <div className={`
                                    rounded-lg transition-all duration-200 h-full
                                    ${status === 'representative' ? 'ring-4 ring-indigo-500 ring-offset-2 dark:ring-offset-gray-900 shadow-xl' : ''}
                                    ${status === 'sibling' ? 'opacity-70 grayscale hover:grayscale-0 hover:opacity-100' : ''}
                                 `}>
                                    <CombinationCard
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
                                        positioningRules={positioningRules}
                                        markPositioningMap={markPositioningMap}
                                        characterSets={characterSets!}
                                        glyphVersion={glyphVersion}
                                        groups={groups}
                                        hideTick={status === 'sibling'}
                                    />
                                 </div>
                                 
                                 {status === 'representative' && (
                                     <div className="absolute -top-2 -left-2 bg-indigo-600 text-white p-1 rounded-full shadow-md z-20 border-2 border-white dark:border-gray-800" title={t('classRepresentative')}>
                                        <CrownIcon className="w-3 h-3" />
                                     </div>
                                 )}

                                 {status === 'sibling' && (
                                     <div 
                                        className={`absolute -top-1 -left-1 text-white p-1 rounded-full shadow-sm z-20 border border-white dark:border-gray-800
                                            ${classType === 'mark' ? 'bg-purple-500' : 'bg-blue-500'}
                                        `} 
                                        title={`Synced with ${representativeLabel}`}
                                    >
                                        <LinkIcon className="w-3 h-3" />
                                     </div>
                                 )}
                            </div>
                        );
                    }}
                />
            </div>
        </div>
    );
};

export default React.memo(PositioningGridView);
