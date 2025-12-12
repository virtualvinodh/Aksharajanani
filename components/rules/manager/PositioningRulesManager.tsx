
import React, { useState } from 'react';
import { useLocale } from '../../../contexts/LocaleContext';
import { AttachmentClass, CharacterSet, MarkAttachmentRules, PositioningRules, RecommendedKerning } from '../../../types';
import GroupManager from './GroupManager';
import RuleManager from './RuleManager';
import KerningManager from './KerningManager';

interface PositioningRulesManagerProps {
    // Props passed from Modal
    positioningRules: PositioningRules[];
    setPositioningRules: (v: PositioningRules[]) => void;
    
    markAttachmentRules: MarkAttachmentRules;
    setMarkAttachmentRules: (v: MarkAttachmentRules) => void;
    
    markAttachmentClasses: AttachmentClass[];
    setMarkAttachmentClasses: (v: AttachmentClass[]) => void;
    
    baseAttachmentClasses: AttachmentClass[];
    setBaseAttachmentClasses: (v: AttachmentClass[]) => void;
    
    recommendedKerning: RecommendedKerning[];
    setRecommendedKerning: (v: RecommendedKerning[]) => void;
    
    groups: Record<string, string[]>; // From RulesContext
    setGroups: (g: Record<string, string[]>) => void; // Optional if we want to edit global groups here
    
    characterSets: CharacterSet[];
}

const PositioningRulesManager: React.FC<PositioningRulesManagerProps> = (props) => {
    const { t } = useLocale();
    const [activeTab, setActiveTab] = useState<'groups' | 'rules' | 'kerning'>('groups');

    const tabs = [
        { id: 'groups', label: 'Groups & Classes', desc: 'Define character sets' },
        { id: 'rules', label: 'Rules & Anchors', desc: 'Logic and attachments' },
        { id: 'kerning', label: 'Kerning', desc: 'Spacing pairs' },
    ] as const;

    return (
        <div className="flex flex-col h-full">
            {/* Tab Navigation */}
            <div className="flex border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 sticky top-0 z-20">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex-1 py-4 px-4 text-center border-b-2 transition-colors focus:outline-none ${
                            activeTab === tab.id
                                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-900/10'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700/50'
                        }`}
                    >
                        <div className="text-sm font-bold">{tab.label}</div>
                        <div className="text-xs opacity-70 hidden sm:block">{tab.desc}</div>
                    </button>
                ))}
            </div>

            {/* Content Area */}
            <div className="flex-grow p-4 sm:p-6 overflow-y-auto bg-gray-50 dark:bg-gray-900/50">
                <div className="max-w-6xl mx-auto">
                    {activeTab === 'groups' && (
                        <GroupManager 
                            groups={props.groups} 
                            setGroups={props.setGroups}
                            markClasses={props.markAttachmentClasses}
                            setMarkClasses={props.setMarkAttachmentClasses}
                            baseClasses={props.baseAttachmentClasses}
                            setBaseClasses={props.setBaseAttachmentClasses}
                            characterSets={props.characterSets}
                        />
                    )}

                    {activeTab === 'rules' && (
                        <RuleManager 
                            positioningRules={props.positioningRules}
                            setPositioningRules={props.setPositioningRules}
                            markAttachment={props.markAttachmentRules}
                            setMarkAttachment={props.setMarkAttachmentRules}
                            groups={props.groups}
                            characterSets={props.characterSets}
                        />
                    )}

                    {activeTab === 'kerning' && (
                        <KerningManager 
                            kerning={props.recommendedKerning}
                            setKerning={props.setRecommendedKerning}
                            groups={props.groups}
                            characterSets={props.characterSets}
                        />
                    )}
                </div>
            </div>
        </div>
    );
};

export default PositioningRulesManager;
