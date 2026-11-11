
import { useCallback } from 'react';
import { useProject } from '../contexts/ProjectContext';
import { useRules } from '../contexts/RulesContext';
import { renameGroupInState } from '../services/refactoringService';
import { useLayout } from '../contexts/LayoutContext';
import { useLocale } from '../contexts/LocaleContext';

export const useRefactoring = () => {
    const { t } = useLocale();
    const { showNotification } = useLayout();
    const { 
        characterSets, positioningRules, setPositioningRules,
        markAttachmentRules, setMarkAttachmentRules,
        markAttachmentClasses, setMarkAttachmentClasses,
        baseAttachmentClasses, setBaseAttachmentClasses,
        recommendedKerning, setRecommendedKerning,
        dispatch: characterDispatch,
        setPositioningGroupNames // To update the set of known groups
    } = useProject();
    
    const { state: rulesState, dispatch: rulesDispatch } = useRules();

    const renameGroup = useCallback((oldName: string, newName: string, type: 'group' | 'set') => {
        if (!characterSets || !rulesState.fontRules) return;

        const currentState = {
            characterSets,
            groups: rulesState.fontRules.groups || {},
            positioningRules,
            markAttachmentRules,
            markAttachmentClasses,
            baseAttachmentClasses,
            recommendedKerning,
            fontRules: rulesState.fontRules
        };

        const newState = renameGroupInState(currentState, oldName, newName, type);

        // Batch Updates
        if (type === 'set') {
             characterDispatch({ type: 'SET_CHARACTER_SETS', payload: newState.characterSets });
        } else {
             // For groups, the fontRules update handles the definition change
             // Only the renamed group changes; other groups keep their positioning status.
             setPositioningGroupNames(prev => {
                 if (!prev.has(oldName)) return prev;
                 const next = new Set(prev);
                 next.delete(oldName);
                 next.add(newName);
                 return next;
             });
        }

        setPositioningRules(newState.positioningRules);
        setMarkAttachmentRules(newState.markAttachmentRules);
        setMarkAttachmentClasses(newState.markAttachmentClasses);
        setBaseAttachmentClasses(newState.baseAttachmentClasses);
        setRecommendedKerning(newState.recommendedKerning);
        
        // This updates 'groups' and all GSUB/GPOS references
        rulesDispatch({ type: 'SET_FONT_RULES', payload: newState.fontRules });

        showNotification(t('updateComplete'), 'success');

    }, [characterSets, rulesState.fontRules, positioningRules, markAttachmentRules, markAttachmentClasses, baseAttachmentClasses, recommendedKerning, characterDispatch, setPositioningRules, setMarkAttachmentRules, setMarkAttachmentClasses, setBaseAttachmentClasses, setRecommendedKerning, rulesDispatch, setPositioningGroupNames, showNotification, t]);

    return { renameGroup };
};
