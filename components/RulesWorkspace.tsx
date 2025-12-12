
import React from 'react';
import RulesPage from './RulesPage';
import { PositioningRules } from '../types';
import { useProject } from '../contexts/ProjectContext';
import { useGlyphData } from '../contexts/GlyphDataContext';
import { useKerning } from '../contexts/KerningContext';
import { usePositioning } from '../contexts/PositioningContext';
import { useRules } from '../contexts/RulesContext';
import { useSettings } from '../contexts/SettingsContext';
import ProgressIndicator from './ProgressIndicator';
import { useLocale } from '../contexts/LocaleContext';
import { BackIcon } from '../constants';
import Footer from './Footer';

interface RulesWorkspaceProps {
    positioningRules: PositioningRules[] | null;
    isFeaOnlyMode: boolean;
    rulesProgress: { completed: number; total: number };
    onClose?: () => void;
}

const RulesWorkspace: React.FC<RulesWorkspaceProps> = (props) => {
    const { characterSets, allCharsByName, allCharsByUnicode, positioningGroupNames } = useProject();
    const { glyphDataMap, version: glyphVersion } = useGlyphData();
    const { kerningMap } = useKerning();
    const { markPositioningMap } = usePositioning();
    const { state, dispatch } = useRules();
    const { settings, metrics } = useSettings();
    const { t } = useLocale();
    
    const { rulesProgress, onClose, ...rulesPageProps } = props;

    if (!characterSets || !settings || !metrics) return null;

    return (
        <div className="fixed inset-0 bg-white dark:bg-gray-900 z-50 flex flex-col">
             <header className="bg-white/80 dark:bg-gray-800/50 backdrop-blur-sm p-4 flex justify-between items-center shadow-md w-full flex-shrink-0">
                <button
                  onClick={onClose}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors duration-200"
                >
                  <BackIcon />
                  <span className="hidden sm:inline">{t('back')}</span>
                </button>
                <div className="text-center">
                  <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">{t('openTypeRules')}</h2>
                </div>
                <div className="w-24 hidden sm:block"></div>
             </header>

            <div className="flex-shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <ProgressIndicator
                    completed={rulesProgress.completed}
                    total={rulesProgress.total}
                    progressTextKey="rulesProgress"
                />
            </div>
            <div className="flex-grow overflow-y-auto">
                <RulesPage 
                    {...rulesPageProps}
                    allCharacterSets={characterSets}
                    allCharsByName={allCharsByName}
                    allCharsByUnicode={allCharsByUnicode}
                    kerningMap={kerningMap}
                    markPositioningMap={markPositioningMap}
                    glyphDataMap={glyphDataMap}
                    strokeThickness={settings.strokeThickness}
                    fontRules={state.fontRules}
                    onFontRulesChange={(rules) => dispatch({ type: 'SET_FONT_RULES', payload: rules })}
                    fontName={settings.fontName}
                    settings={settings}
                    metrics={metrics}
                    isFeaEditMode={state.isFeaEditMode}
                    onIsFeaEditModeChange={(isEditMode) => dispatch({ type: 'SET_FEA_EDIT_MODE', payload: isEditMode })}
                    manualFeaCode={state.manualFeaCode}
                    onManualFeaCodeChange={(code) => dispatch({ type: 'SET_MANUAL_FEA_CODE', payload: code })}
                    onHasUnsavedChanges={(isDirty) => dispatch({ type: 'SET_HAS_UNSAVED_RULES', payload: isDirty })}
                    glyphVersion={glyphVersion}
                    hiddenGroupNames={positioningGroupNames}
                />
            </div>
            <Footer hideOnMobile={true} />
        </div>
    );
};

export default React.memo(RulesWorkspace);
