
import { useState, useEffect, useCallback } from 'react';
import { CallBackProps, STATUS, EVENTS, ACTIONS } from 'react-joyride';
import { useProject } from '../../contexts/ProjectContext';
import { useLayout } from '../../contexts/LayoutContext';
import { usePositioning } from '../../contexts/PositioningContext';
import { useKerning } from '../../contexts/KerningContext';
import { useTutorialSteps } from './useTutorialSteps';

export const useLinearTutorial = (
    translations: Record<string, string> | null,
    isLargeScreen: boolean
) => {
    const { script, allCharsByName } = useProject();
    const { selectedCharacter, activeModal, workspace, isNavDrawerOpen } = useLayout();
    const { markPositioningMap } = usePositioning();
    const { kerningMap } = useKerning();

    const [run, setRun] = useState(false);
    const [stepIndex, setStepIndex] = useState(0);
    const [hasUserSkipped, setHasUserSkipped] = useState(false);
    const steps = useTutorialSteps(translations, isLargeScreen);

    const isActive = script?.id === 'tutorial';

    // Resume Listener for View Transitions
    useEffect(() => {
        const handleViewLoaded = () => {
             if (isActive && !hasUserSkipped) {
                 setRun(true);
             }
        };
        window.addEventListener('aksharajanani:view-loaded', handleViewLoaded);
        return () => window.removeEventListener('aksharajanani:view-loaded', handleViewLoaded);
    }, [isActive, hasUserSkipped]);

    // Resume Listener for Dashboard Return
    useEffect(() => {
        const isDismissed = localStorage.getItem('tutorial_dismissed') === 'true';
        if (isActive && !run && !activeModal && !selectedCharacter && steps.length > 0 && !isDismissed && !hasUserSkipped) {
            const currentStep = steps[stepIndex];
            if (currentStep?.target && typeof currentStep.target === 'string') {
                 const targetEl = document.querySelector(currentStep.target);
                 if (targetEl) {
                     const timer = setTimeout(() => setRun(true), 500);
                     return () => clearTimeout(timer);
                 }
            }
        }
    }, [activeModal, selectedCharacter, run, isActive, stepIndex, steps, hasUserSkipped]);

    // Initialize / Reset
    useEffect(() => {
        if (isActive) {
            const isDismissed = localStorage.getItem('tutorial_dismissed') === 'true';
            if (!isDismissed && !hasUserSkipped) {
                setRun(true);
            }
        } else {
             setRun(false);
             setStepIndex(0);
             setHasUserSkipped(false);
        }
    }, [isActive]);

    // State Machine
    useEffect(() => {
        if (!run || !isActive || steps.length === 0) return;

        const currentStep = steps[stepIndex];
        if (!currentStep) return;

        // Proactive Click Interception
        const isTransitionToEditor = currentStep.target === '[data-tour="combo-card-Eͤ"]';
        const isTransitionToKerning = currentStep.target === '[data-tour="pair-card-Te"]';
        const isTransitionBack = currentStep.target === '[data-tour="header-back"]';
        
        if (isTransitionToEditor || isTransitionToKerning || isTransitionBack) {
             const selector = currentStep.target as string;
             const handleProactiveClick = (e: MouseEvent) => {
                 const target = e.target as HTMLElement;
                 if (target.closest(selector)) {
                     setRun(false);
                     setStepIndex(prev => prev + 1);
                 }
             };
             document.addEventListener('click', handleProactiveClick, true);
             return () => {
                 document.removeEventListener('click', handleProactiveClick, true);
             };
        }

        // Passive Polling
        if (currentStep.target === '[data-tour="start-positioning-rule-A-ͤ"]') {
             const interval = setInterval(() => {
                 if (document.querySelector('[data-tour="combo-card-Aͤ"]')) {
                     clearInterval(interval);
                     setStepIndex(prev => prev + 1);
                 }
             }, 300);
             return () => clearInterval(interval);
        }

        const advanceRule = currentStep.data?.advanceOn;
        if (!advanceRule) return;

        const advance = () => setTimeout(() => setStepIndex(prev => prev + 1), 500);

        switch (advanceRule) {
            case 'selected-A': if (selectedCharacter?.name === 'A') advance(); break;
            case 'selected-a': if (selectedCharacter?.name === 'a') advance(); break;
            case 'selected-T': if (selectedCharacter?.name === 'T') advance(); break;
            case 'selected-F': if (selectedCharacter?.name === 'F') advance(); break;
            case 'selected-E': if (selectedCharacter?.name === 'E') advance(); break;
            case 'selected-e': if (selectedCharacter?.name === 'e') advance(); break;
            case 'selected-combining': if (selectedCharacter?.name === 'ͤ') advance(); break;
            case 'unlinked-combining': if (selectedCharacter?.name === 'ͤ' && !selectedCharacter.link) advance(); break;
            case 'relinked-combining': if (selectedCharacter?.name === 'ͤ' && selectedCharacter.link) advance(); break;
            case 'selected-n': if (selectedCharacter?.name === 'n') advance(); break;
            case 'selected-tilde': if (selectedCharacter?.name === '̃') advance(); break;
            case 'selected-macron': if (selectedCharacter?.name === '̄') advance(); break;
            case 'selected-ntilde': if (selectedCharacter?.name === 'ñ') advance(); break;
            case 'selected-nbar': if (selectedCharacter?.name === 'n̄') advance(); break;
            case 'unlinked-nbar': {
                const linkButton = document.querySelector('[data-tour="strip-link-toggle"]');
                if (linkButton && linkButton.getAttribute('title')?.startsWith('Exception')) {
                    advance();
                }
                break;
            }
            case 'back-to-dashboard': if (!activeModal && !selectedCharacter) advance(); break;
            case 'test-modal-open': if (activeModal?.name === 'testPage') advance(); break;
            case 'test-modal-close': if (activeModal === null) advance(); break;
            case 'drawer-open': if (isNavDrawerOpen) advance(); break;
            case 'workspace-positioning': if (workspace === 'positioning') advance(); break;
            case 'workspace-kerning': if (workspace === 'kerning') advance(); break;
            case 'accepted-A-combining': {
                const A = allCharsByName.get('A');
                const combining = allCharsByName.get('ͤ');
                if (A?.unicode && combining?.unicode && markPositioningMap.has(`${A.unicode}-${combining.unicode}`)) {
                    advance();
                }
                break;
            }
            case 'kerned-Te-action': {
                const T = allCharsByName.get('T');
                const e = allCharsByName.get('e');
                if (T?.unicode && e?.unicode && kerningMap.has(`${T.unicode}-${e.unicode}`)) {
                     advance();
                }
                break;
            }
            case 'kerning-editor-closed': {
                if (!document.querySelector('[data-tour="kerning-editor-page"]')) {
                    advance();
                }
                break;
            }
        }
    }, [stepIndex, selectedCharacter, activeModal, run, isActive, steps, isNavDrawerOpen, workspace, allCharsByName, markPositioningMap, kerningMap]);

    const handleCallback = useCallback((data: CallBackProps) => {
        if (!isActive) return;
        const { status, type, action, index } = data;
        
        if (type === EVENTS.TARGET_NOT_FOUND) {
             const stepTarget = steps[index]?.target;
             if (stepTarget === '[data-tour="start-positioning-rule-A-ͤ"]') return; 
             if (stepTarget === '[data-tour="positioning-editor-page"]' || stepTarget === '[data-tour="kerning-canvas"]') {
                 setRun(false);
                 return;
             }
             if (stepTarget === '[data-tour="header-back"]') {
                 if (!activeModal && !selectedCharacter) {
                     setStepIndex(prev => prev + 1);
                     setTimeout(() => setRun(true), 100);
                 }
                 return;
             }
        }
        
        if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
            if (status === STATUS.SKIPPED) {
                setHasUserSkipped(true);
            }
            setRun(false);
            setStepIndex(0);
        } else if (type === EVENTS.STEP_AFTER) {
            const currentStep = steps[index];
            if (!currentStep) return;
            if (!currentStep.data?.advanceOn) {
                if (action === ACTIONS.NEXT) setStepIndex(index + 1);
            }
            if (action === ACTIONS.PREV) setStepIndex(index - 1);
        }
    }, [isActive, steps, activeModal, selectedCharacter]);

    return { run, stepIndex, steps, handleCallback };
};
