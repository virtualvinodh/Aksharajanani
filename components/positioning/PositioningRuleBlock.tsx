
import React, { useMemo } from 'react';
import { Character, GlyphData, MarkAttachmentRules, MarkPositioningMap, PositioningRules, CharacterSet, FontMetrics } from '../../types';
import { useLocale } from '../../contexts/LocaleContext';
import CombinationCard from '../CombinationCard';
import { resolveAttachmentRule } from '../../services/glyphRenderService';

interface PositioningRuleBlockProps {
    rule: PositioningRules;
    pairs: { base: Character, mark: Character, ligature: Character }[];
    onEditPair: (pair: { base: Character, mark: Character, ligature: Character }) => void;
    glyphDataMap: Map<number, GlyphData>;
    markPositioningMap: MarkPositioningMap;
    strokeThickness: number;
    markAttachmentRules: MarkAttachmentRules | null;
    characterSets: CharacterSet[];
    groups: Record<string, string[]>;
    glyphVersion: number;
    metrics: FontMetrics;
}

const PositioningRuleBlock: React.FC<PositioningRuleBlockProps> = ({
    rule,
    pairs,
    onEditPair,
    glyphDataMap,
    markPositioningMap,
    strokeThickness,
    markAttachmentRules,
    characterSets,
    groups,
    glyphVersion,
    metrics
}) => {
    const { t } = useLocale();

    // 1. Determine Title based on Anchors
    const anchorInfo = useMemo(() => {
        if (pairs.length === 0) return { title: "Unknown Rule", subtitle: "" };
        
        const sample = pairs[0];
        // Resolve the rule used for this sample pair
        const ruleDef = resolveAttachmentRule(
            sample.base.name, 
            sample.mark.name, 
            markAttachmentRules, 
            characterSets, 
            groups
        );

        if (ruleDef) {
            const basePoint = ruleDef[0]?.replace(/([A-Z])/g, ' $1').trim() || 'Origin';
            const markPoint = ruleDef[1]?.replace(/([A-Z])/g, ' $1').trim() || 'Origin';
            return {
                title: `${basePoint} → ${markPoint}`,
                subtitle: `Offsets: X: ${ruleDef[2] || 0}, Y: ${ruleDef[3] || 0}`
            };
        }
        
        return { title: "Automatic Positioning", subtitle: "Geometric Center" };
    }, [pairs, markAttachmentRules, characterSets, groups]);

    // 2. Identify Groups for Display
    const groupDisplay = useMemo(() => {
        const bases = rule.base.map(b => b.startsWith('$') ? t(b.substring(1)) : (b.startsWith('@') ? b : b)).join(', ');
        const marks = (rule.mark || []).map(m => m.startsWith('$') ? t(m.substring(1)) : (m.startsWith('@') ? m : m)).join(', ');
        return { bases, marks };
    }, [rule, t]);

    // 3. Calculate Progress
    const totalPairs = pairs.length;
    const completedPairs = useMemo(() => {
        return pairs.filter(p => 
            markPositioningMap.has(`${p.base.unicode}-${p.mark.unicode}`)
        ).length;
    }, [pairs, markPositioningMap]);
    
    const percentage = totalPairs > 0 ? Math.round((completedPairs / totalPairs) * 100) : 0;
    const isComplete = percentage === 100;

    // 4. Hero Selection (First Pair)
    const heroPair = pairs[0];

    return (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden flex flex-col transition-all hover:shadow-md">
            {/* Header */}
            <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 flex justify-between items-start">
                <div className="flex-grow min-w-0 pr-4">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white capitalize truncate">
                        {anchorInfo.title}
                    </h3>
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400 flex flex-wrap gap-2 items-center">
                        <span className="font-mono bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 px-1.5 py-0.5 rounded truncate max-w-[150px]" title={groupDisplay.bases}>
                            {groupDisplay.bases}
                        </span>
                        <span className="text-gray-300">+</span>
                        <span className="font-mono bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300 px-1.5 py-0.5 rounded truncate max-w-[150px]" title={groupDisplay.marks}>
                            {groupDisplay.marks}
                        </span>
                    </div>
                </div>
                <div className="text-xs font-mono text-gray-400 bg-white dark:bg-gray-700 border dark:border-gray-600 px-2 py-1 rounded whitespace-nowrap">
                    {rule.gpos ? `GPOS: ${rule.gpos}` : (rule.gsub ? `GSUB: ${rule.gsub}` : 'Default')}
                </div>
            </div>

            {/* Content Body */}
            <div className="p-6 flex justify-center items-center bg-gray-50/30 dark:bg-gray-900/30 border-b border-gray-100 dark:border-gray-700">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-40 h-40 relative group cursor-pointer" onClick={() => onEditPair(heroPair)}>
                        <CombinationCard 
                            baseChar={heroPair.base}
                            markChar={heroPair.mark}
                            ligature={heroPair.ligature}
                            // Always force false to keep the hero plain
                            isPositioned={false}
                            canEdit={true}
                            onClick={() => onEditPair(heroPair)}
                            // Pass dummy callback for inline confirm
                            onConfirmPosition={() => {}}
                            glyphDataMap={glyphDataMap}
                            strokeThickness={strokeThickness}
                            markAttachmentRules={markAttachmentRules}
                            markPositioningMap={markPositioningMap}
                            characterSets={characterSets}
                            glyphVersion={glyphVersion}
                            groups={groups}
                        />
                         <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                            <span className="bg-black/75 text-white text-xs px-3 py-1 rounded-full shadow-lg font-medium backdrop-blur-sm">
                                Edit Group
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer: Progress */}
            <div className="bg-white dark:bg-gray-800 p-4">
                 <div className="flex items-center gap-3">
                    <div className="text-xs font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap flex-shrink-0">
                        {completedPairs} / {totalPairs} ({percentage}%)
                    </div>
                    <div className="flex-grow bg-gray-300 dark:bg-gray-700 rounded-full h-2 overflow-hidden" role="presentation">
                        <div
                        className={`${isComplete ? 'bg-green-500' : 'bg-indigo-600'} h-2 rounded-full transition-all duration-500`}
                        style={{ width: `${percentage}%` }}
                        role="progressbar"
                        aria-valuenow={percentage}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        />
                    </div>
                 </div>
            </div>
        </div>
    );
};

export default React.memo(PositioningRuleBlock);
