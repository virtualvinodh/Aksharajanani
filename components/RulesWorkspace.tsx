
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

interface RulesWorkspaceProps {
    positioningRules: PositioningRules[] | null;
    isFeaOnlyMode: boolean;
    rulesProgress: { completed: number; total: number };
}

const RulesWorkspace: React.FC<RulesWorkspaceProps> = (props) => {
    const { characterSets, allCharsByName, allCharsByUnicode } = useProject();
    const { glyphDataMap, version: glyphVersion } = useGlyphData();
    const { kerningMap } = useKerning();
    const { markPositioningMap } = usePositioning();
    const { state, dispatch } = useRules();
    const { settings, metrics } = useSettings();
    
    const { rulesProgress, ...rulesPageProps } = props;

    if (!characterSets || !settings || !metrics) return null;

    return (
        <div className="flex flex-col h-full overflow-hidden">
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
                />
            </div>
        </div>
    );
};

export default React.memo(RulesWorkspace);
