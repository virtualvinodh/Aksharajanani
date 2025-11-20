
import React, { useState, useCallback, useRef } from 'react';
import { useCharacter } from '../../contexts/CharacterContext';
import { useGlyphData } from '../../contexts/GlyphDataContext';
import { useKerning } from '../../contexts/KerningContext';
import { useSettings } from '../../contexts/SettingsContext';
import { usePositioning } from '../../contexts/PositioningContext';
import { useRules } from '../../contexts/RulesContext';
import { useLayout } from '../../contexts/LayoutContext';
import { useLocale } from '../../contexts/LocaleContext';
import { exportToOtf } from '../../services/fontService';
import * as dbService from '../../services/dbService';
import { ProjectData, PositioningRules, RecommendedKerning, MarkAttachmentRules } from '../../types';
import { useProgressCalculators } from '../useProgressCalculators';
import { simpleHash } from '../../utils/stringUtils'; // Import from utils

interface UseExportActionsProps {
    fullProjectStateForSaving: Omit<ProjectData, 'projectId' | 'savedAt'> | null;
    projectId: number | undefined;
    setIsAnimatingExport: React.Dispatch<React.SetStateAction<boolean>>;
    downloadTriggerRef: React.MutableRefObject<(() => void) | null>;
    // State from Load/Other hooks that isn't in context but needed for calculation
    recommendedKerning: RecommendedKerning[] | null;
    positioningRules: PositioningRules[] | null;
    markAttachmentRules: MarkAttachmentRules | null;
}

export const useExportActions = ({
    fullProjectStateForSaving, projectId, setIsAnimatingExport, downloadTriggerRef,
    recommendedKerning, positioningRules, markAttachmentRules
}: UseExportActionsProps) => {
    
    const { t } = useLocale();
    const layout = useLayout();
    const { settings, metrics } = useSettings();
    const { characterSets, allCharsByUnicode, allCharsByName } = useCharacter();
    const { glyphDataMap } = useGlyphData();
    const { kerningMap } = useKerning();
    const { markPositioningMap } = usePositioning();
    const { state: rulesState } = useRules();
    const { fontRules, isFeaEditMode, manualFeaCode } = rulesState;

    const [isExporting, setIsExporting] = useState(false);
    const [feaErrorState, setFeaErrorState] = useState<{ error: string, blob: Blob } | null>(null);
    const [testPageFont, setTestPageFont] = useState<{ blob: Blob | null, feaError: string | null }>({ blob: null, feaError: null });

    const { drawingProgress } = useProgressCalculators({ 
        characterSets, glyphDataMap, markPositioningMap, recommendedKerning, 
        allCharsByName, fontRules, kerningMap, positioningRules 
    });

    const downloadFontBlob = useCallback((blob: Blob, fontName: string) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const safeFontName = fontName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        a.download = `${safeFontName}_${timestamp}.otf`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    }, []);

    const handleSaveProject = useCallback(async () => {
        if (!settings || !fullProjectStateForSaving) return;

        const projectDataWithTimestamp: ProjectData = {
            ...fullProjectStateForSaving,
            projectId,
            savedAt: new Date().toISOString(),
        };
        const jsonString = JSON.stringify(projectDataWithTimestamp, null, 2);
        
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const safeFontName = settings.fontName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        a.download = `${safeFontName}_${timestamp}.json`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
        
        layout.showNotification(t('projectSavedAsJson'));
    }, [settings, fullProjectStateForSaving, projectId, layout, t]);

    const getCachedOrGeneratedFont = useCallback(async (): Promise<{ blob: Blob; feaError: string | null } | null> => {
        if (!fullProjectStateForSaving || !settings || !metrics || !characterSets) {
            layout.showNotification('Project data is not ready.', 'error');
            return null;
        }
    
        const projectString = JSON.stringify(fullProjectStateForSaving);
        const currentHash = simpleHash(projectString);
        let feaError: string | null = null;
        let fontBlob: Blob | null = null;
    
        if (projectId) {
            const cachedData = await dbService.getFontCache(projectId);
            if (cachedData && cachedData.hash === currentHash) {
                fontBlob = cachedData.fontBinary;
            }
        }
    
        if (!fontBlob) {
            const result = await exportToOtf(glyphDataMap, settings, t, fontRules, metrics, characterSets, kerningMap, markPositioningMap, allCharsByUnicode, positioningRules, markAttachmentRules, isFeaEditMode, manualFeaCode, layout.showNotification);
            fontBlob = result.blob;
            feaError = result.feaError;
            if (projectId && fontBlob && !feaError) {
                await dbService.setFontCache(projectId, currentHash, fontBlob);
            }
        }
        
        if (!fontBlob) return null;
        return { blob: fontBlob, feaError: feaError };
    }, [fullProjectStateForSaving, projectId, settings, metrics, characterSets, glyphDataMap, t, fontRules, kerningMap, markPositioningMap, allCharsByUnicode, positioningRules, markAttachmentRules, isFeaEditMode, manualFeaCode, layout.showNotification]);

    const performExportAfterAnimation = useCallback(async () => {
        setIsExporting(true);
        layout.showNotification(t('exportingNotice'), 'info');
        setFeaErrorState(null);
        
        const result = await getCachedOrGeneratedFont();
    
        if (result) {
            const { blob, feaError } = result;
            if (feaError) {
                setFeaErrorState({ error: feaError, blob });
                layout.openModal('feaError');
            } else {
                downloadFontBlob(blob, settings!.fontName);
                layout.showNotification(t('fontExportedSuccess'));
            }
        } else {
            layout.showNotification(t('errorFontGeneration', { error: 'Failed to generate font.' }), 'error');
        }
        setIsExporting(false);
    }, [getCachedOrGeneratedFont, downloadFontBlob, layout, settings, t]);

    const startExportProcess = useCallback(() => {
        const triggerAnimation = () => {
            setTimeout(() => {
                downloadTriggerRef.current = performExportAfterAnimation;
                setIsAnimatingExport(true);
            }, 1000);
        };

        if (drawingProgress.completed === 0) {
            layout.showNotification(t('errorNoGlyphs'), 'error');
            return;
        }

        const isIncomplete = {
            drawing: drawingProgress.completed < drawingProgress.total,
            positioning: (positioningRules?.length ?? 0) > markPositioningMap.size,
            kerning: (recommendedKerning?.length ?? 0) > kerningMap.size,
        };
        const shouldWarn = isIncomplete.drawing || (settings?.editorMode === 'advanced' && (isIncomplete.positioning || isIncomplete.kerning));

        if (shouldWarn) {
            layout.openModal('incompleteWarning', {
                status: isIncomplete,
                editorMode: settings?.editorMode,
                onConfirm: () => {
                    layout.closeModal();
                    triggerAnimation();
                }
            });
        } else {
            triggerAnimation();
        }
    }, [drawingProgress, positioningRules, markPositioningMap, recommendedKerning, kerningMap, settings, layout, t, downloadTriggerRef, performExportAfterAnimation, setIsAnimatingExport]);

    const handleTestClick = useCallback(async () => {
        setIsExporting(true);
        layout.showNotification(t('exportingNotice'), 'info');
        const result = await getCachedOrGeneratedFont();
        setIsExporting(false);
        if (result) {
            setTestPageFont(result);
            layout.openModal('testPage');
        } else {
            layout.showNotification(t('errorFontGeneration', { error: 'Failed to prepare font for testing.' }), 'error');
        }
    }, [getCachedOrGeneratedFont, layout, t]);

    return {
        isExporting,
        feaErrorState,
        testPageFont,
        startExportProcess,
        performExportAfterAnimation,
        handleSaveProject,
        handleTestClick,
        downloadFontBlob
    };
};
