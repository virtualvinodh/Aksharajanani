
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

    // 3. Hero Selection (First Pair)
    const heroPair = pairs[0];
    
    // Check if hero is positioned
    const isHeroPositioned = markPositioningMap.has(`${heroPair.base.unicode}-${heroPair.mark.unicode}`);

    return (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 flex justify-between items-start">
                <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white capitalize">
                        {anchorInfo.title}
                    </h3>
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400 flex flex-wrap gap-2 items-center">
                        <span className="font-mono bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 px-1.5 py-0.5 rounded">
                            {groupDisplay.bases}
                        </span>
                        <span className="text-gray-300">+</span>
                        <span className="font-mono bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300 px-1.5 py-0.5 rounded">
                            {groupDisplay.marks}
                        </span>
                        <span className="text-gray-300">|</span>
                        <span>{pairs.length} Pairs</span>
                    </div>
                </div>
                <div className="text-xs font-mono text-gray-400 bg-white dark:bg-gray-700 border dark:border-gray-600 px-2 py-1 rounded">
                    {rule.gpos ? `GPOS: ${rule.gpos}` : (rule.gsub ? `GSUB: ${rule.gsub}` : 'Default')}
                </div>
            </div>

            {/* Content Body */}
            <div className="p-8 flex justify-center items-center bg-gray-50/30 dark:bg-gray-900/30">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-48 h-48 relative group">
                        <CombinationCard 
                            baseChar={heroPair.base}
                            markChar={heroPair.mark}
                            ligature={heroPair.ligature}
                            isPositioned={isHeroPositioned}
                            canEdit={true}
                            onClick={() => onEditPair(heroPair)}
                            // Pass dummy callback for inline confirm, though we mainly use modal
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
                            <span className="bg-black/75 text-white text-sm px-3 py-1 rounded-full shadow-lg font-medium">Edit Group</span>
                        </div>
                    </div>
                    <div className="text-center">
                        <span className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest block">Representative Pair</span>
                        <span className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 block">Click to edit and navigate all members</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default React.memo(PositioningRuleBlock);
