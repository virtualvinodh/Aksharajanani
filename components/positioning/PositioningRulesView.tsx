import React from 'react';
import PositioningRuleBlock from './PositioningRuleBlock';
import CombinationCard from '../CombinationCard';
import { Character, GlyphData, MarkAttachmentRules, MarkPositioningMap, PositioningRules, CharacterSet, FontMetrics } from '../../types';
import { BackIcon, LeftArrowIcon, RightArrowIcon } from '../../constants';

interface PositioningRulesViewProps {
    ruleGroups: { rule: PositioningRules, pairs: any[], id: number }[];
    selectedRuleGroupId: number | null;
    setSelectedRuleGroupId: (id: number | null) => void;
    activeRuleGroup: any;
    pagedRulePairs: any[];
    rulePage: number;
    setRulePage: React.Dispatch<React.SetStateAction<number>>;
    ruleTotalPages: number;
    markPositioningMap: MarkPositioningMap;
    getPairClassKey: (pair: any) => string;
    classCounts: Map<string, number>;
    setEditingPair: (pair: any) => void;
    setEditingIndex: (index: number) => void;
    setEditingContextList: (list: any[]) => void;
    handleConfirmPosition: (base: Character, mark: Character, ligature: Character) => void;
    glyphDataMap: Map<number, GlyphData>;
    strokeThickness: number;
    markAttachmentRules: MarkAttachmentRules | null;
    characterSets: CharacterSet[];
    groups: Record<string, string[]>;
    glyphVersion: number;
    metrics: FontMetrics;
    ITEMS_PER_PAGE: number;
}

const PositioningRulesView: React.FC<PositioningRulesViewProps> = ({
    ruleGroups, selectedRuleGroupId, setSelectedRuleGroupId, activeRuleGroup,
    pagedRulePairs, rulePage, setRulePage, ruleTotalPages, markPositioningMap,
    getPairClassKey, classCounts, setEditingPair, setEditingIndex, setEditingContextList,
    handleConfirmPosition, glyphDataMap, strokeThickness, markAttachmentRules, characterSets,
    groups, glyphVersion, metrics, ITEMS_PER_PAGE
}) => {
    if (selectedRuleGroupId === null) {
        // Level 1: List of Blocks
        return (
            <div className="space-y-6 max-w-4xl mx-auto">
                {ruleGroups.map((group) => (
                    <PositioningRuleBlock
                        key={group.id}
                        rule={group.rule}
                        pairs={group.pairs}
                        onEditPair={() => {
                            setSelectedRuleGroupId(group.id);
                            setRulePage(1);
                        }}
                        glyphDataMap={glyphDataMap}
                        markPositioningMap={markPositioningMap}
                        strokeThickness={strokeThickness}
                        markAttachmentRules={markAttachmentRules}
                        characterSets={characterSets}
                        groups={groups}
                        glyphVersion={glyphVersion}
                        metrics={metrics}
                    />
                ))}
                {ruleGroups.length === 0 && (
                     <div className="text-center p-12 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
                        <p className="text-gray-500 italic">No rules defined or no glyphs drawn for rules.</p>
                     </div>
                )}
            </div>
        );
    }

    // Level 2: Drill-down Grid
    return (
        <div className="animate-fade-in-up">
            {/* Header with Back Button */}
            <div className="flex items-center justify-between mb-6 border-b dark:border-gray-700 pb-4">
                <div className="flex items-center gap-4">
                    <button 
                        onClick={() => setSelectedRuleGroupId(null)}
                        className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                        title="Back to Rules"
                    >
                        <BackIcon />
                    </button>
                    <div>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white">Rule Details</h3>
                        {activeRuleGroup && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                {activeRuleGroup.pairs.length} pairs total • Page {rulePage}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-4">
                {pagedRulePairs.map((pair, idx) => {
                    const isPositioned = markPositioningMap.has(`${pair.base.unicode}-${pair.mark.unicode}`);
                    const pairId = `${pair.base.unicode}-${pair.mark.unicode}`;
                    
                    // Determine stacking
                    const classKey = getPairClassKey(pair);
                    const siblingCount = classCounts.get(classKey) || 1;
                    const isStacked = siblingCount > 1;
                    
                    return (
                        <div key={pairId} className={`relative group ${isStacked ? 'mb-1 mr-1' : ''}`}>
                             {/* Stack Backgrounds */}
                             {isStacked && (
                                <>
                                    {siblingCount > 5 && (
                                        <div className={`absolute inset-0 translate-x-2 translate-y-2 rounded-lg border -z-20 ${
                                            isPositioned 
                                            ? "bg-indigo-50/30 dark:bg-indigo-900/10 border-indigo-100 dark:border-indigo-800/50" 
                                            : "bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600"
                                        }`} />
                                    )}
                                    <div className={`absolute inset-0 translate-x-1 translate-y-1 rounded-lg border -z-10 ${
                                        isPositioned
                                        ? "bg-indigo-50/60 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-700/60"
                                        : "bg-gray-50 dark:bg-gray-750 border border-gray-200 dark:border-gray-600"
                                    }`} />
                                </>
                             )}
                            
                            <div className="relative z-0">
                                <CombinationCard
                                    baseChar={pair.base}
                                    markChar={pair.mark}
                                    ligature={pair.ligature}
                                    isPositioned={isPositioned}
                                    canEdit={true}
                                    onClick={() => {
                                        setEditingPair(pair);
                                        // Find actual index in the full context list to allow proper navigation
                                        const actualIndex = activeRuleGroup!.pairs.indexOf(pair);
                                        setEditingIndex(actualIndex);
                                        
                                        // IMPORTANT: Filter context list by class key
                                        const filteredContext = activeRuleGroup!.pairs.filter((p: any) => getPairClassKey(p) === classKey);
                                        setEditingContextList(filteredContext);
                                        
                                        // Recalculate index in filtered list
                                        const filteredIndex = filteredContext.findIndex((p: any) => p.base.unicode === pair.base.unicode && p.mark.unicode === pair.mark.unicode);
                                        setEditingIndex(filteredIndex);
                                    }}
                                    onConfirmPosition={() => handleConfirmPosition(pair.base, pair.mark, pair.ligature)}
                                    glyphDataMap={glyphDataMap}
                                    strokeThickness={strokeThickness}
                                    markAttachmentRules={markAttachmentRules}
                                    markPositioningMap={markPositioningMap}
                                    characterSets={characterSets}
                                    glyphVersion={glyphVersion}
                                    groups={groups}
                                />
                                {/* Stack count badge */}
                                {isStacked && (
                                    <div className="absolute top-0 right-0 bg-indigo-600 text-white text-[9px] font-bold px-1.5 rounded-bl-lg rounded-tr-lg shadow-sm z-10">
                                        +{siblingCount - 1}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Pagination Controls */}
            {ruleTotalPages > 1 && (
                <div className="flex justify-center items-center gap-4 mt-8">
                    <button
                        onClick={() => setRulePage(p => Math.max(1, p - 1))}
                        disabled={rulePage === 1}
                        className="p-2 rounded-full bg-gray-200 dark:bg-gray-700 disabled:opacity-50 hover:bg-gray-300 dark:hover:bg-gray-600"
                    >
                        <LeftArrowIcon />
                    </button>
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                        Page {rulePage} of {ruleTotalPages}
                    </span>
                    <button
                        onClick={() => setRulePage(p => Math.min(ruleTotalPages, p + 1))}
                        disabled={rulePage === ruleTotalPages}
                        className="p-2 rounded-full bg-gray-200 dark:bg-gray-700 disabled:opacity-50 hover:bg-gray-300 dark:hover:bg-gray-600"
                    >
                        <RightArrowIcon />
                    </button>
                </div>
            )}
        </div>
    );
};

export default React.memo(PositioningRulesView);