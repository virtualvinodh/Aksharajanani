
import React, { useState, useEffect, useCallback } from 'react';
import PositioningRulesManager from './rules/manager/PositioningRulesManager';
import { useLocale } from '../contexts/LocaleContext';
import { useProject } from '../contexts/ProjectContext';
import { useRules } from '../contexts/RulesContext';
import { useLayout } from '../contexts/LayoutContext';
import {
    PositioningRules, MarkAttachmentRules, RecommendedKerning, AttachmentClass
} from '../types';
import { BackIcon, SaveIcon, RefreshIcon } from '../constants';
import ConfirmationModal from './ConfirmationModal';

interface PositioningRulesModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const PositioningRulesModal: React.FC<PositioningRulesModalProps> = ({ isOpen, onClose }) => {
    const { t } = useLocale();
    const { showNotification } = useLayout();
    const {
        positioningRules, setPositioningRules,
        markAttachmentRules, setMarkAttachmentRules,
        markAttachmentClasses, setMarkAttachmentClasses,
        baseAttachmentClasses, setBaseAttachmentClasses,
        recommendedKerning, setRecommendedKerning,
        characterSets
    } = useProject();

    const { state: rulesState, dispatch: rulesDispatch } = useRules();
    const groups = rulesState.fontRules?.groups || {};

    // Local state for the modal to allow "Cancel" behavior
    const [localPosRules, setLocalPosRules] = useState<PositioningRules[]>([]);
    const [localMarkAttach, setLocalMarkAttach] = useState<MarkAttachmentRules>({});
    const [localMarkClasses, setLocalMarkClasses] = useState<AttachmentClass[]>([]);
    const [localBaseClasses, setLocalBaseClasses] = useState<AttachmentClass[]>([]);
    const [localKerning, setLocalKerning] = useState<RecommendedKerning[]>([]);
    const [localGroups, setLocalGroups] = useState<Record<string, string[]>>({});
    
    // State to track initial data for dirty checking
    const [initialStateJson, setInitialStateJson] = useState<string>('');

    // Modals state
    const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
    const [isUnsavedConfirmOpen, setIsUnsavedConfirmOpen] = useState(false);

    const loadData = useCallback(() => {
        // Create copies
        const pos = JSON.parse(JSON.stringify(positioningRules || []));
        const mark = JSON.parse(JSON.stringify(markAttachmentRules || {}));
        const mClass = JSON.parse(JSON.stringify(markAttachmentClasses || []));
        const bClass = JSON.parse(JSON.stringify(baseAttachmentClasses || []));
        const kern = JSON.parse(JSON.stringify(recommendedKerning || []));
        const grps = JSON.parse(JSON.stringify(groups));

        setLocalPosRules(pos);
        setLocalMarkAttach(mark);
        setLocalMarkClasses(mClass);
        setLocalBaseClasses(bClass);
        setLocalKerning(kern);
        setLocalGroups(grps);

        // Snapshot for dirty check
        const snapshot = { pos, mark, mClass, bClass, kern, grps };
        setInitialStateJson(JSON.stringify(snapshot));
    }, [positioningRules, markAttachmentRules, markAttachmentClasses, baseAttachmentClasses, recommendedKerning, groups]);

    // Hydrate local state on open
    useEffect(() => {
        if (isOpen) {
            loadData();
        }
    }, [isOpen, loadData]);

    const handleSave = () => {
        setPositioningRules(localPosRules);
        setMarkAttachmentRules(localMarkAttach);
        setMarkAttachmentClasses(localMarkClasses);
        setBaseAttachmentClasses(localBaseClasses);
        setRecommendedKerning(localKerning);
        
        // Save Global Groups back to Rules Context
        if (rulesState.fontRules) {
             const newRules = { ...rulesState.fontRules, groups: localGroups };
             rulesDispatch({ type: 'SET_FONT_RULES', payload: newRules });
        }
        
        onClose();
    };

    const hasUnsavedChanges = () => {
        const currentSnapshot = {
            pos: localPosRules,
            mark: localMarkAttach,
            mClass: localMarkClasses,
            bClass: localBaseClasses,
            kern: localKerning,
            grps: localGroups
        };
        return JSON.stringify(currentSnapshot) !== initialStateJson;
    };

    const handleCloseRequest = () => {
        if (hasUnsavedChanges()) {
            setIsUnsavedConfirmOpen(true);
        } else {
            onClose();
        }
    };

    const handleResetConfirm = () => {
        loadData();
        setIsResetConfirmOpen(false);
        showNotification("Changes reverted to last saved version.", "info");
    };

    const handleDiscardChanges = () => {
        setIsUnsavedConfirmOpen(false);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-white dark:bg-gray-900 z-50 flex flex-col animate-fade-in-up">
            {/* Header */}
            <header className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm p-4 flex justify-between items-center shadow-md w-full flex-shrink-0 z-30 border-b dark:border-gray-700">
                <button
                    onClick={handleCloseRequest}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors duration-200"
                >
                    <BackIcon />
                    <span className="hidden sm:inline">{t('cancel')}</span>
                </button>
                <div className="text-center">
                    <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{t('manageRules')}</h2>
                </div>
                <div className="flex justify-end gap-2">
                     <button 
                        onClick={() => setIsResetConfirmOpen(true)}
                        className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                        title="Revert Changes"
                    >
                        <RefreshIcon />
                        <span className="hidden sm:inline font-medium">Revert</span>
                    </button>
                     <button 
                        onClick={handleSave} 
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors shadow-md"
                    >
                        <SaveIcon />
                        <span className="hidden sm:inline">{t('save')}</span>
                    </button>
                </div>
            </header>

            {/* Main Content - No Padding on Container to let Tabs stretch full width */}
            <main className="flex-grow overflow-hidden bg-gray-50 dark:bg-gray-900/50">
                <PositioningRulesManager
                    positioningRules={localPosRules} setPositioningRules={setLocalPosRules}
                    markAttachmentRules={localMarkAttach} setMarkAttachmentRules={setLocalMarkAttach}
                    markAttachmentClasses={localMarkClasses} setMarkAttachmentClasses={setLocalMarkClasses}
                    baseAttachmentClasses={localBaseClasses} setBaseAttachmentClasses={setLocalBaseClasses}
                    recommendedKerning={localKerning} setRecommendedKerning={setLocalKerning}
                    groups={localGroups} setGroups={setLocalGroups}
                    characterSets={characterSets || []}
                />
            </main>

            <ConfirmationModal
                isOpen={isResetConfirmOpen}
                onClose={() => setIsResetConfirmOpen(false)}
                onConfirm={handleResetConfirm}
                title="Revert Changes?"
                message="This will revert all changes made in this session to the last saved state. This cannot be undone."
                confirmActionText="Revert"
            />

            <ConfirmationModal
                isOpen={isUnsavedConfirmOpen}
                onClose={() => setIsUnsavedConfirmOpen(false)}
                onConfirm={handleDiscardChanges}
                title="Unsaved Changes"
                message="You have unsaved changes. Are you sure you want to discard them and close?"
                confirmActionText="Discard"
            />
        </div>
    );
};

export default PositioningRulesModal;
