
import React, { useState, useEffect } from 'react';
import PositioningPane from './scriptcreator/PositioningPane';
import { useLocale } from '../contexts/LocaleContext';
import { useProject } from '../contexts/ProjectContext';
import { useRules } from '../contexts/RulesContext';
import {
    PositioningRules, MarkAttachmentRules, RecommendedKerning, AttachmentClass
} from '../types';
import { BackIcon, SaveIcon } from '../constants';

interface PositioningRulesModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const PositioningRulesModal: React.FC<PositioningRulesModalProps> = ({ isOpen, onClose }) => {
    const { t } = useLocale();
    const {
        positioningRules, setPositioningRules,
        markAttachmentRules, setMarkAttachmentRules,
        markAttachmentClasses, setMarkAttachmentClasses,
        baseAttachmentClasses, setBaseAttachmentClasses,
        recommendedKerning, setRecommendedKerning,
        characterSets
    } = useProject();

    const { state: rulesState } = useRules();
    const groups = rulesState.fontRules?.groups || {};

    // Local state for the modal to allow "Cancel" behavior
    const [localPosRules, setLocalPosRules] = useState<PositioningRules[]>([]);
    const [localMarkAttach, setLocalMarkAttach] = useState<MarkAttachmentRules>({});
    const [localMarkClasses, setLocalMarkClasses] = useState<AttachmentClass[]>([]);
    const [localBaseClasses, setLocalBaseClasses] = useState<AttachmentClass[]>([]);
    const [localKerning, setLocalKerning] = useState<RecommendedKerning[]>([]);

    // Hydrate local state on open
    useEffect(() => {
        if (isOpen) {
            setLocalPosRules(JSON.parse(JSON.stringify(positioningRules || [])));
            setLocalMarkAttach(JSON.parse(JSON.stringify(markAttachmentRules || {})));
            setLocalMarkClasses(JSON.parse(JSON.stringify(markAttachmentClasses || [])));
            setLocalBaseClasses(JSON.parse(JSON.stringify(baseAttachmentClasses || [])));
            setLocalKerning(JSON.parse(JSON.stringify(recommendedKerning || [])));
        }
    }, [isOpen, positioningRules, markAttachmentRules, markAttachmentClasses, baseAttachmentClasses, recommendedKerning]);

    const handleSave = () => {
        setPositioningRules(localPosRules);
        setMarkAttachmentRules(localMarkAttach);
        setMarkAttachmentClasses(localMarkClasses);
        setBaseAttachmentClasses(localBaseClasses);
        setRecommendedKerning(localKerning);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-white dark:bg-gray-900 z-50 flex flex-col animate-fade-in-up">
            {/* Header */}
            <header className="bg-white/80 dark:bg-gray-800/50 backdrop-blur-sm p-4 flex justify-between items-center shadow-md w-full flex-shrink-0 z-10">
                <button
                    onClick={onClose}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors duration-200"
                >
                    <BackIcon />
                    <span className="hidden sm:inline">{t('cancel')}</span>
                </button>
                <div className="text-center">
                    <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{t('manageRules')}</h2>
                </div>
                <div className="w-24 flex justify-end">
                     <button 
                        onClick={handleSave} 
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors shadow-md"
                    >
                        <SaveIcon />
                        <span className="hidden sm:inline">{t('save')}</span>
                    </button>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-grow overflow-y-auto p-4 sm:p-6 bg-gray-50 dark:bg-gray-900/50">
                <div className="max-w-5xl mx-auto">
                    <PositioningPane
                        positioningRules={localPosRules} setPositioningRules={setLocalPosRules}
                        attachment={localMarkAttach} setAttachment={setLocalMarkAttach}
                        markAttachmentClasses={localMarkClasses} setMarkAttachmentClasses={setLocalMarkClasses}
                        baseAttachmentClasses={localBaseClasses} setBaseAttachmentClasses={setLocalBaseClasses}
                        kerning={localKerning} setKerning={setLocalKerning}
                        groups={groups}
                        characterSets={characterSets || []}
                    />
                </div>
            </main>
        </div>
    );
};

export default PositioningRulesModal;
