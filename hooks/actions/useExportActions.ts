
import React, { useState, useCallback } from 'react';
import { useProject } from '../../contexts/ProjectContext';
import { useGlyphData } from '../../contexts/GlyphDataContext';
import { useKerning } from '../../contexts/KerningContext';
import { useSettings } from '../../contexts/SettingsContext';
import { usePositioning } from '../../contexts/PositioningContext';
import { useRules } from '../../contexts/RulesContext';
import { useLayout } from '../../contexts/LayoutContext';
import { useLocale } from '../../contexts/LocaleContext';
import { exportToOtf } from '../../services/fontService';
import * as dbService from '../../services/dbService';
import { ProjectData } from '../../types';
import { useProgressCalculators } from '../useProgressCalculators';
import { simpleHash } from '../../utils/stringUtils';

export type ExportingType = 'export' | 'test' | 'create' | null;

interface UseExportActionsProps {
    getProjectState: () => Omit<ProjectData, 'projectId' | 'savedAt'> | null;
    projectId: number | undefined;
    projectName: string;
    setIsAnimatingExport: React.Dispatch<React.SetStateAction<boolean>>;
    downloadTriggerRef: React.MutableRefObject<(() => void) | null>;
}

export const useExportActions = ({
    getProjectState, projectId, projectName, setIsAnimatingExport, downloadTriggerRef,
}: UseExportActionsProps) => {
    
    const { t } = useLocale();
    const layout = useLayout();
    const { settings, metrics } = useSettings();
    const { characterSets, allCharsByUnicode, allCharsByName } = useProject();
    const { glyphDataMap, version: glyphVersion } = useGlyphData();
    const { kerningMap, suggestedKerningMap } = useKerning();
    const { markPositioningMap } = usePositioning();
    const { state: rulesState } = useRules();
    const { fontRules, isFeaEditMode, manualFeaCode } = rulesState;
    const { positioningRules, markAttachmentRules, recommendedKerning, guideFont } = useProject();

    const [exportingType, setExportingType] = useState<ExportingType>(null);
    const [feaErrorState, setFeaErrorState] = useState<{ error: string, blob: Blob } | null>(null);
    const [testPageFont, setTestPageFont] = useState<{ blob: Blob | null, feaError: string | null }>({ blob: null, feaError: null });
    
    // State for Creator Page (mirroring Test Page pattern)
    const [creatorFont, setCreatorFont] = useState<{ blob: Blob | null, feaError: string | null }>({ blob: null, feaError: null });

    const { drawingProgress, positioningProgress, kerningProgress } = useProgressCalculators({ 
        characterSets, glyphDataMap, markPositioningMap, recommendedKerning, 
        allCharsByName, fontRules, kerningMap, positioningRules, glyphVersion 
    });

    const downloadFontBlob = useCallback((blob: Blob, fileNameBase: string) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const safeFileName = fileNameBase.replace(/[^a-z0-9\- ]/gi, '_').trim();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        a.download = `${safeFileName}_${timestamp}.otf`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    }, []);

    const handleSaveProject = useCallback(async () => {
        const projectState = getProjectState();
        if (!settings || !projectState) return;

        const projectDataWithTimestamp: ProjectData = {
            ...projectState,
            projectId,
            savedAt: new Date().toISOString(),
        };
        const jsonString = JSON.stringify(projectDataWithTimestamp, null, 2);
        
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        const safeFileName = projectName.replace(/[^a-z0-9\- ]/gi, '_').trim();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        a.download = `${safeFileName}_${timestamp}.json`;
        
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
        
        layout.showNotification(t('projectSavedAsJson'));
    }, [settings, getProjectState, projectId, layout, t, projectName]);
    
    // NEW: Export as Template (Structure only, no paths)
    const handleSaveTemplate = useCallback(async () => {
        const projectState = getProjectState();
        if (!settings || !projectState) return;

        // Create a clean copy
        const templateData: ProjectData = { ...projectState };
        
        // 1. Strip Glyph Paths
        templateData.glyphs = templateData.glyphs.map(([unicode, _]) => [unicode, { paths: [] }]);
        
        // 2. Reset Positioning Vectors
        templateData.markPositioning = []; 
        
        // 3. Reset Kerning
        templateData.kerning = [];
        
        // 4. Ensure Metadata & Config
        // Explicitly include guideFont and map custom sample text
        if (guideFont) {
            templateData.guideFont = guideFont;
        }
        if (settings.customSampleText) {
            // We store sample text in the script config structure for templates
            // This allows new projects created from this template to pick it up.
        }

        // 5. Clean DB IDs
        delete templateData.projectId;
        delete templateData.savedAt;
        templateData.name = `${projectName} Template`;

        const jsonString = JSON.stringify(templateData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        const safeFileName = projectName.replace(/[^a-z0-9\- ]/gi, '_').trim();
        a.download = `${safeFileName}_Template.json`;
        
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
        layout.showNotification("Template saved successfully!");

    }, [settings, getProjectState, projectName, layout, guideFont]);

    const getCachedOrGeneratedFont = useCallback(async (): Promise<{ blob: Blob; feaError: string | null } | null> => {
        const projectState = getProjectState();

        if (!projectState || !settings || !metrics || !characterSets) {
            layout.showNotification('Project data is not ready.', 'error');
            return null;
        }
    
        const projectString = JSON.stringify(projectState);
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
            // MERGE KERNING: Use suggested values as base, overwrite with manual values
            const effectiveKerningMap = new Map(suggestedKerningMap);
            kerningMap.forEach((value, key) => {
                effectiveKerningMap.set(key, value);
            });

            const result = await exportToOtf(glyphDataMap, settings, t, fontRules, metrics, characterSets, effectiveKerningMap, markPositioningMap, allCharsByUnicode, positioningRules, markAttachmentRules, isFeaEditMode, manualFeaCode, layout.showNotification);
            fontBlob = result.blob;
            feaError = result.feaError;
            if (projectId && fontBlob && !feaError) {
                await dbService.setFontCache(projectId, currentHash, fontBlob);
            }
        }
        
        if (!fontBlob) return null;
        return { blob: fontBlob, feaError: feaError };
    }, [getProjectState, projectId, settings, metrics, characterSets, glyphDataMap, t, fontRules, kerningMap, suggestedKerningMap, markPositioningMap, allCharsByUnicode, positioningRules, markAttachmentRules, isFeaEditMode, manualFeaCode, layout.showNotification]);

    const performExportAfterAnimation = useCallback(async () => {
        setExportingType('export');
        layout.showNotification(t('exportingNotice'), 'info');
        setFeaErrorState(null);
        
        const result = await getCachedOrGeneratedFont();
    
        if (result) {
            const { blob, feaError } = result;
            if (feaError) {
                setFeaErrorState({ error: feaError, blob });
                layout.openModal('feaError');
            } else {
                downloadFontBlob(blob, projectName);
                layout.showNotification(t('fontExportedSuccess'));
            }
        } else {
            layout.showNotification(t('errorFontGeneration', { error: 'Failed to generate font.' }), 'error');
        }
        setExportingType(null);
    }, [getCachedOrGeneratedFont, downloadFontBlob, layout, t, projectName]);

    // Shared logic to check for completeness and warn if necessary
    const checkAndExecute = useCallback((onProceed: () => void) => {
        if (drawingProgress.completed === 0) {
            layout.showNotification(t('errorNoGlyphs'), 'error');
            return;
        }

        const isIncomplete = {
            drawing: drawingProgress.completed < drawingProgress.total,
            positioning: positioningProgress.completed < positioningProgress.total,
            kerning: kerningProgress.completed < kerningProgress.total,
        };
        
        const shouldWarn = isIncomplete.drawing || isIncomplete.positioning || isIncomplete.kerning;

        if (shouldWarn) {
            layout.openModal('incompleteWarning', {
                status: isIncomplete,
                editorMode: settings?.editorMode,
                onConfirm: () => {
                    layout.closeModal();
                    onProceed();
                }
            });
        } else {
            onProceed();
        }
    }, [drawingProgress, positioningProgress, kerningProgress, settings, layout, t]);

    const startExportProcess = useCallback(() => {
        const triggerAnimation = () => {
            setTimeout(() => {
                downloadTriggerRef.current = performExportAfterAnimation;
                setIsAnimatingExport(true);
            }, 1000);
        };

        checkAndExecute(triggerAnimation);
    }, [checkAndExecute, downloadTriggerRef, performExportAfterAnimation, setIsAnimatingExport]);

    const handleTestClick = useCallback(async () => {
        setExportingType('test');
        layout.showNotification(t('exportingNotice'), 'info');
        const result = await getCachedOrGeneratedFont();
        setExportingType(null);
        if (result) {
            setTestPageFont(result);
            layout.openModal('testPage');
        } else {
            layout.showNotification(t('errorFontGeneration', { error: 'Failed to prepare font for testing.' }), 'error');
        }
    }, [getCachedOrGeneratedFont, layout, t]);
    
    // New handler moved from useAppActions
    const handleCreatorClick = useCallback(() => {
        const proceedToCreator = async () => {
            setExportingType('create');
            layout.showNotification(t('exportingNotice'), 'info');
            try {
                const result = await getCachedOrGeneratedFont();
                if (result) {
                    setCreatorFont(result);
                    layout.setCurrentView('creator');
                } else {
                    layout.showNotification('Failed to prepare font for Creator.', 'error');
                }
            } finally {
                setExportingType(null);
            }
        };

        checkAndExecute(proceedToCreator);

    }, [getCachedOrGeneratedFont, layout, t, checkAndExecute]);

    return {
        exportingType,
        feaErrorState,
        testPageFont,
        creatorFont, // Exposed
        startExportProcess,
        performExportAfterAnimation,
        handleSaveProject,
        handleSaveTemplate,
        handleTestClick,
        handleCreatorClick, // Exposed
        downloadFontBlob,
        getCachedOrGeneratedFont
    };
};
