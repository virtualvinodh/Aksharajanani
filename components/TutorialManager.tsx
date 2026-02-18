
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Joyride, { CallBackProps, STATUS, Step, EVENTS, ACTIONS, TooltipRenderProps, Placement } from 'react-joyride';
import { useProject } from '../contexts/ProjectContext';
import { useGlyphData } from '../contexts/GlyphDataContext';
import { useLayout } from '../contexts/LayoutContext';
import { useTheme } from '../contexts/ThemeContext';
import { useLocale } from '../contexts/LocaleContext';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { usePositioning } from '../contexts/PositioningContext';
import { useKerning } from '../contexts/KerningContext';
import { Tool } from '../types';
import { isGlyphComplete } from '../utils/glyphUtils';

// Custom Tooltip Component to handle "Don't Show Again" vs "Exit"
const CustomTooltip = ({
    index,
    step,
    backProps,
    primaryProps,
    skipProps,
    tooltipProps,
    isLastStep,
}: TooltipRenderProps) => {
    
    // Access translations passed via step.data
    const labels = step.data?.translations || {};

    // 1. Define the action logic closing over current props
    const performDismiss = (e?: React.MouseEvent<HTMLElement>, persist: boolean = true) => {
        if (persist) {
            // Main Tutorial Logic
            if (step.data?.isTutorial) {
                 localStorage.setItem('tutorial_dismissed', 'true');
            } 
            // JIT Hint Logic - Persist only on manual dismissal
            else if (step.data?.storageKey) {
                 localStorage.setItem(step.data.storageKey, 'true');
            }
        }
        
        const safeEvent = e || { 
            preventDefault: () => {}, 
            stopPropagation: () => {},
            currentTarget: { blur: () => {} }
        } as any;

        if (skipProps && typeof skipProps.onClick === 'function') {
            skipProps.onClick(safeEvent);
        }
    };

    const handlePrimaryClick = (e: React.MouseEvent<HTMLElement>) => {
        // For JIT hints (single step), treat "OK" as a dismissal to ensure it closes reliably.
        if (!step.data?.isTutorial && isLastStep) {
            performDismiss(e, true);
        } else {
            // For the main linear tutorial or multi-step JIT, use the standard navigation
            primaryProps.onClick(e);
        }
    };

    // 2. Use a ref to keep the latest version of the action accessible to the timer
    const dismissRef = useRef(performDismiss);
    
    // Update ref on every render so the timer always calls the fresh function with fresh props
    useEffect(() => {
        dismissRef.current = performDismiss;
    });

    // 3. Set up the timer ONCE on mount
    useEffect(() => {
        // Do not auto-dismiss the main tutorial steps
        if (step.data?.isTutorial) return;

        const timer = setTimeout(() => {
            // Call the latest version of the function
            if (dismissRef.current) {
                // Soft dismissal: persist=false. 
                // If the user hasn't interacted, we hide it but don't mark it as seen forever.
                dismissRef.current(undefined, false);
            }
        }, 15000); // 15 seconds (increased for multi-step readability)

        return () => clearTimeout(timer);
    }, []); 
  
    return (
      <div {...tooltipProps} className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-5 max-w-sm border border-gray-200 dark:border-gray-700 flex flex-col gap-4 relative z-50">
         <div className="text-gray-700 dark:text-gray-200 text-sm leading-relaxed">
           {step.content}
         </div>
         
         <div className="flex flex-col gap-3 mt-2">
              <div className="flex justify-between items-center">
                   <div className="flex items-center">
                      {!isLastStep && (
                           <button {...skipProps} onClick={(e) => performDismiss(e, false)} className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 text-xs font-bold uppercase tracking-wider transition-colors">
                               {step.data?.isTutorial ? (labels.exit || 'Exit Tutorial') : (labels.close || 'Close')}
                           </button>
                      )}
                   </div>
                   <div className="flex gap-2">
                       {index > 0 && (
                          <button {...backProps} className="px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                             {labels.back || 'Back'}
                          </button>
                       )}
                       {!step.hideFooter && (
                           <button 
                                {...primaryProps} 
                                onClick={handlePrimaryClick}
                                className="px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 shadow-md transition-all active:scale-95"
                           >
                              {isLastStep ? (step.data?.isTutorial ? (labels.finishBtn || 'Finish') : (labels.ok || 'OK')) : (labels.next || 'Next')}
                           </button>
                       )}
                   </div>
              </div>
         </div>
      </div>
    );
};

// Dummy component to get access to context
const TutorialStateProvider: React.FC<{ onToolChange: (tool: Tool) => void }> = ({ onToolChange }) => {
    const { activeModal } = useLayout(); 
    const editor = (activeModal?.props as any)?.editorContext;
    const currentTool = editor?.currentTool;
    
    useEffect(() => {
        if(currentTool) {
            onToolChange(currentTool);
        }
    }, [currentTool, onToolChange]);
    
    return null;
}

const TutorialManager: React.FC = () => {
    const { script, allCharsByName } = useProject();
    const { selectedCharacter, activeModal, workspace, currentView, isNavDrawerOpen } = useLayout();
    const { theme } = useTheme();
    const { locale } = useLocale();
    const { markPositioningMap } = usePositioning();
    const { kerningMap } = useKerning();
    
    const [run, setRun] = useState(false);
    const [stepIndex, setStepIndex] = useState(0);
    const [translations, setTranslations] = useState<Record<string, string> | null>(null);
    const [activeSteps, setActiveSteps] = useState<Step[]>([]);
    const [currentTool, setCurrentTool] = useState<Tool>('pen');
    
    const isLargeScreen = useMediaQuery('(min-width: 1024px)');
    const [scrollOffset, setScrollOffset] = useState(150);
    
    // Resume Listener for View Transitions
    useEffect(() => {
        const handleViewLoaded = () => {
             // If tutorial is paused and waiting for a view transition, resume it now.
             if (script?.id === 'tutorial') {
                 setRun(true);
             }
        };
        window.addEventListener('aksharajanani:view-loaded', handleViewLoaded);
        return () => window.removeEventListener('aksharajanani:view-loaded', handleViewLoaded);
    }, [script?.id]);

    // Resume Listener for Dashboard Return (Fix for Mobile Back Button Stall)
    useEffect(() => {
        const isDismissed = localStorage.getItem('tutorial_dismissed') === 'true';

        // Check if tutorial should auto-resume. 
        // Must strictly check !isDismissed to prevent zombie tutorial after "Exit".
        if (script?.id === 'tutorial' && !run && !activeModal && !selectedCharacter && activeSteps.length > 0 && !isDismissed) {
            // If paused at dashboard, check if the current step target exists.
            const currentStep = activeSteps[stepIndex];
            if (currentStep?.target && typeof currentStep.target === 'string') {
                 // Try to find the target. If found, we can resume.
                 // This catches cases where proactive click paused the tour, but no 'view-loaded' event fired.
                 const targetEl = document.querySelector(currentStep.target);
                 if (targetEl) {
                     const timer = setTimeout(() => setRun(true), 500);
                     return () => clearTimeout(timer);
                 }
            }
        }
    }, [activeModal, selectedCharacter, run, script?.id, stepIndex, activeSteps]);

    const updateScrollOffset = useCallback(() => {
        let total = 0;
        const appHeader = document.querySelector('header');
        if (appHeader) total += appHeader.getBoundingClientRect().height;
        
        const z20Headers = document.querySelectorAll('.z-20');
        z20Headers.forEach(el => {
            if (el.getBoundingClientRect().top < 200) {
                 total += el.clientHeight;
            }
        });
        
        const progressBar = document.querySelector('[role="progressbar"]');
        if (progressBar) {
            const container = progressBar.closest('.border-b');
            if (container) total += container.clientHeight;
        }

        const sticky = document.querySelector('.sticky.top-0');
        if (sticky) total += sticky.clientHeight;

        const finalOffset = Math.max(total + 30, 200); 
        setScrollOffset(finalOffset);
    }, []);

    useEffect(() => {
        const timer = setTimeout(updateScrollOffset, 200);
        return () => clearTimeout(timer);
    }, [workspace, currentView, selectedCharacter, stepIndex, updateScrollOffset]);

    useEffect(() => {
        const fetchTranslations = async () => {
            try {
                const response = await fetch(`/locales/tutorial/${locale}.json`);
                if (response.ok) {
                    const data = await response.json();
                    setTranslations(data);
                } else {
                    const fallback = await fetch(`/locales/tutorial/en.json`);
                    if (fallback.ok) {
                        const data = await fallback.json();
                        setTranslations(data);
                    }
                }
            } catch (error) {
                console.error("Failed to load tutorial translations:", error);
            }
        };
        fetchTranslations();
    }, [locale]);

    const linearTutorialSteps: Step[] = useMemo(() => {
        if (!translations) return [];
        
        const richText = (key: string) => <div dangerouslySetInnerHTML={{ __html: translations[key] }} />;
        
        const steps: Step[] = [
            // 0. Welcome
            {
                target: 'body',
                content: (
                    <div>
                        <h3 className="font-bold text-lg mb-2 text-indigo-600 dark:text-indigo-400">{translations.welcomeTitle}</h3>
                        <p>{translations.welcomeContent}</p>
                    </div>
                ),
                placement: 'center' as Placement,
                disableBeacon: true,
                data: { isTutorial: true, translations }
            },
            // 1. Click 'A'
            {
                target: '[data-tour="grid-item-A"]',
                content: translations.clickFirstChar,
                spotlightClicks: true,
                disableBeacon: true,
                hideFooter: true, 
                data: { isTutorial: true, advanceOn: 'selected-A', translations }
            },
            
            // Only show split view explanation on large screens where it exists
            ...(isLargeScreen ? [{ 
                target: '[data-tour="split-view-resizer"]', 
                content: richText('splitViewIntro'), 
                placement: 'right' as Placement, 
                data: { isTutorial: true, translations }, 
                styles: { spotlight: { borderRadius: '8px' } } 
            }] : []),

            { target: '[data-tour="toolbar-pen"]', content: translations.toolbarPenContent, placement: (isLargeScreen ? 'right' : 'bottom') as Placement, disableBeacon: true, data: { isTutorial: true, translations } },
            { target: '[data-tour="drawing-canvas"]', content: translations.drawContent, placement: 'right' as Placement, disableBeacon: true, spotlightClicks: true, disableOverlayClose: true, data: { isTutorial: true, translations } },
            
            // Mobile Specific: Ask user to exit editor to see the Test button
            ...(!isLargeScreen ? [{
                target: '[data-tour="header-back"]', 
                content: translations.clickBackToDashboard, 
                spotlightClicks: true, 
                hideFooter: true, 
                data: { isTutorial: true, advanceOn: 'back-to-dashboard', translations } 
            }] : []),

            { target: '[data-tour="header-test"]', content: translations.clickTest, spotlightClicks: true, hideFooter: true, data: { isTutorial: true, advanceOn: 'test-modal-open', translations } },
            { target: '[data-tour="test-page-input"]', content: translations.testPageInput, placement: 'bottom' as Placement, disableBeacon: true, data: { isTutorial: true, translations } },
            { target: '[data-tour="test-page-close"]', content: translations.closeTestPage, spotlightClicks: true, hideFooter: true, data: { isTutorial: true, advanceOn: 'test-modal-close', translations } },
            
            // Mobile Specific: Ask user to re-enter editor for 'A' to continue flow
            ...(!isLargeScreen ? [{
                target: '[data-tour="grid-item-A"]', 
                content: translations.clickAAgain, 
                spotlightClicks: true, 
                hideFooter: true, 
                data: { isTutorial: true, advanceOn: 'selected-A', translations } 
            }] : []),

            { target: '[data-tour="header-next"]', content: translations.clickNextForA, spotlightClicks: true, hideFooter: true, data: { isTutorial: true, advanceOn: 'selected-a', translations } },
            { target: '[data-tour="drawing-canvas"]', content: translations.drawLowerA, placement: 'right' as Placement, disableBeacon: true, spotlightClicks: true, disableOverlayClose: true, data: { isTutorial: true, translations } },
            { target: '[data-tour="main-toolbar"]', content: translations.toolbarIntro, placement: (isLargeScreen ? 'right' : 'bottom') as Placement, data: { isTutorial: true, translations } },
            { target: '[data-tour="main-toolbar"]', content: translations.toolbarActionsIntro, placement: (isLargeScreen ? 'right' : 'bottom') as Placement, data: { isTutorial: true, translations } },
            { target: '[data-tour="tool-select"]', content: richText('toolSelect'), placement: (isLargeScreen ? 'left' : 'top') as Placement, data: { isTutorial: true, translations } },
            { target: '[data-tour="tool-pan"]', content: richText('toolPan'), placement: (isLargeScreen ? 'left' : 'top') as Placement, data: { isTutorial: true, translations } },
            { target: '[data-tour="tool-calligraphy"]', content: richText('toolCalligraphy'), placement: (isLargeScreen ? 'left' : 'top') as Placement, data: { isTutorial: true, translations } },
            { target: '[data-tour="tool-eraser"]', content: richText('toolEraser'), placement: (isLargeScreen ? 'left' : 'top') as Placement, data: { isTutorial: true, translations } },
            { target: '[data-tour="tool-slice"]', content: richText('toolSlice'), placement: (isLargeScreen ? 'left' : 'top') as Placement, data: { isTutorial: true, translations } },
            { target: '[data-tour="action-undo"]', content: richText('actionUndo'), placement: (isLargeScreen ? 'left' : 'top') as Placement, data: { isTutorial: true, translations } },
            { target: '[data-tour="action-redo"]', content: richText('actionRedo'), placement: (isLargeScreen ? 'left' : 'top') as Placement, data: { isTutorial: true, translations } },
            { target: '[data-tour="action-cut"]', content: richText('actionCut'), placement: (isLargeScreen ? 'left' : 'top') as Placement, data: { isTutorial: true, translations } },
            { target: '[data-tour="action-copy"]', content: richText('actionCopy'), placement: (isLargeScreen ? 'left' : 'top') as Placement, data: { isTutorial: true, translations } },
            { target: '[data-tour="action-paste"]', content: richText('actionPaste'), placement: (isLargeScreen ? 'left' : 'top') as Placement, data: { isTutorial: true, translations } },
            { target: '[data-tour="action-group"]', content: richText('actionGroup'), placement: (isLargeScreen ? 'left' : 'top') as Placement, data: { isTutorial: true, translations } },
            { target: '[data-tour="action-ungroup"]', content: richText('actionUngroup'), placement: (isLargeScreen ? 'left' : 'top') as Placement, data: { isTutorial: true, translations } },
            { target: '[data-tour="header-next"]', content: translations.clickNextForT, spotlightClicks: true, hideFooter: true, data: { isTutorial: true, advanceOn: 'selected-T', translations } },
            { target: '[data-tour="main-toolbar"]', content: richText('selectLineTool'), spotlightClicks: true, placement: (isLargeScreen ? 'right' : 'bottom') as Placement, disableBeacon: true, data: { isTutorial: true, translations } },
            { target: '[data-tour="drawing-canvas"]', content: translations.drawT, placement: 'right' as Placement, disableBeacon: true, spotlightClicks: true, disableOverlayClose: true, data: { isTutorial: true, translations } },
            { target: '[data-tour="drawing-canvas"]', content: richText('explainBearings'), placement: 'top' as Placement, disableBeacon: true, data: { isTutorial: true, translations } },
            { target: '[data-tour="drawing-canvas"]', content: richText('dragLSB'), placement: 'top' as Placement, disableBeacon: true, spotlightClicks: true, disableOverlayClose: true, data: { isTutorial: true, translations } },
            { target: '[data-tour="drawing-canvas"]', content: richText('dragRSB'), placement: 'top' as Placement, disableBeacon: true, spotlightClicks: true, disableOverlayClose: true, data: { isTutorial: true, translations } },

            ...(isLargeScreen ? [{
                target: '[data-tour="grid-item-F"]', content: translations.selectCharF, spotlightClicks: true, hideFooter: true, placement: 'right' as Placement, data: { isTutorial: true, advanceOn: 'selected-F', translations }
            }] : [{
                target: '[data-tour="floating-grid-btn"]', content: translations.openGrid, spotlightClicks: true, hideFooter: true, data: { isTutorial: true, advanceOn: 'drawer-open', translations }
            },{
                target: '#mobile-nav-drawer [data-tour="grid-item-F"]', content: translations.selectCharF, spotlightClicks: true, hideFooter: true, placement: 'right' as Placement, data: { isTutorial: true, advanceOn: 'selected-F', translations }
            }]),

            { target: '[data-tour="drawing-canvas"]', content: translations.drawCharF, placement: 'right' as Placement, disableBeacon: true, spotlightClicks: true, disableOverlayClose: true, data: { isTutorial: true, translations } },
            { target: '[data-tour="header-next"]', content: translations.clickNextForComposite, spotlightClicks: true, hideFooter: true, data: { isTutorial: true, advanceOn: 'selected-E', translations } },
            { target: 'body', content: richText('compositeExplanation'), placement: 'center' as Placement, disableBeacon: true, data: { isTutorial: true, translations } },
            { target: '[data-tour="drawing-canvas"]', content: translations.drawComposite, placement: 'right' as Placement, disableBeacon: true, spotlightClicks: true, disableOverlayClose: true, data: { isTutorial: true, translations } },
            { target: '[data-tour="header-reset"]', content: richText('compositeTools'), placement: 'bottom' as Placement, disableBeacon: true, data: { isTutorial: true, translations } },

            { target: '[data-tour="header-next"]', content: translations.clickNextForLowerE, spotlightClicks: true, hideFooter: true, data: { isTutorial: true, advanceOn: 'selected-e', translations } },
            { target: '[data-tour="drawing-canvas"]', content: translations.drawLowerE, placement: 'right' as Placement, disableBeacon: true, spotlightClicks: true, disableOverlayClose: true, data: { isTutorial: true, translations } },
            { target: '[data-tour="header-next"]', content: translations.clickNextForLinked, spotlightClicks: true, hideFooter: true, data: { isTutorial: true, advanceOn: 'selected-combining', translations } },
            { target: 'body', content: richText('linkedExplanation'), placement: 'center' as Placement, disableBeacon: true, data: { isTutorial: true, translations } },
            { target: '[data-tour="linked-source-strip"]', content: translations.linkedStripNav, placement: 'top' as Placement, disableBeacon: true, data: { isTutorial: true, translations } },
            { target: '[data-tour="drawing-canvas"]', content: richText('transformLinked'), placement: 'right' as Placement, disableBeacon: true, spotlightClicks: true, data: { isTutorial: true, translations } },
            
            // Unlink/Relink Flow
            { target: '[data-tour="header-unlink"]', content: richText('unlinkExpl'), placement: 'bottom' as Placement, spotlightClicks: true, disableOverlayClose: true, hideFooter: true, data: { isTutorial: true, advanceOn: 'unlinked-combining', translations } },
            { target: '[data-tour="header-relink"]', content: richText('relinkExpl'), placement: 'bottom' as Placement, spotlightClicks: true, hideFooter: true, data: { isTutorial: true, advanceOn: 'relinked-combining', translations } },

            { target: '[data-tour="header-prev"]', content: translations.clickPrevForModification, spotlightClicks: true, hideFooter: true, data: { isTutorial: true, advanceOn: 'selected-e', translations } },
            { target: '[data-tour="drawing-canvas"]', content: translations.modifyLowerE, placement: 'right' as Placement, disableBeacon: true, spotlightClicks: true, disableOverlayClose: true, data: { isTutorial: true, translations } },
            { target: '[data-tour="header-next"]', content: translations.clickNextToVerify, spotlightClicks: true, hideFooter: true, data: { isTutorial: true, advanceOn: 'selected-combining', translations } },
            { target: '[data-tour="drawing-canvas"]', content: translations.verifyLink, placement: 'right' as Placement, disableBeacon: true, data: { isTutorial: true, translations } },
            
            { target: '[data-tour="header-next"]', content: translations.clickNextForN, spotlightClicks: true, hideFooter: true, data: { isTutorial: true, advanceOn: 'selected-n', translations } },
            { target: '[data-tour="drawing-canvas"]', content: translations.drawN, placement: 'right' as Placement, disableBeacon: true, spotlightClicks: true, disableOverlayClose: true, data: { isTutorial: true, translations } },
            { target: '[data-tour="header-next"]', content: translations.clickNextForTilde, spotlightClicks: true, hideFooter: true, data: { isTutorial: true, advanceOn: 'selected-tilde', translations } },
            { target: '[data-tour="drawing-canvas"]', content: translations.drawTilde, placement: 'right' as Placement, disableBeacon: true, spotlightClicks: true, disableOverlayClose: true, data: { isTutorial: true, translations } },
            { target: '[data-tour="header-next"]', content: translations.clickNextForMacron, spotlightClicks: true, hideFooter: true, data: { isTutorial: true, advanceOn: 'selected-macron', translations } },
            { target: '[data-tour="drawing-canvas"]', content: translations.drawMacron, placement: 'right' as Placement, disableBeacon: true, spotlightClicks: true, disableOverlayClose: true, data: { isTutorial: true, translations } },
            { target: '[data-tour="header-next"]', content: translations.clickNextForNTilde, spotlightClicks: true, hideFooter: true, data: { isTutorial: true, advanceOn: 'selected-ntilde', translations } },
            { target: '[data-tour="positioning-canvas"]', content: richText('positioningConcept'), placement: 'top' as Placement, disableBeacon: true, data: { isTutorial: true, translations } },
            { target: '[data-tour="related-pairs-strip"]', content: richText('positioningStripIntro'), placement: 'top' as Placement, disableBeacon: true, data: { isTutorial: true, translations } },
            { target: '[data-tour="positioning-canvas"]', content: richText('positioningDrag'), placement: 'top' as Placement, disableBeacon: true, spotlightClicks: true, data: { isTutorial: true, translations } },
            { target: '[data-tour="strip-item-n̄"]', content: translations.positioningStripNavToNBar, placement: 'top' as Placement, spotlightClicks: true, hideFooter: true, data: { isTutorial: true, advanceOn: 'selected-nbar', translations } },
            { target: '[data-tour="positioning-canvas"]', content: richText('smartClassExpl'), placement: 'top' as Placement, disableBeacon: true, data: { isTutorial: true, translations } },
            
            // Positioning Detach explanation
            { target: '[data-tour="header-detach-pos"]', content: richText('detachExpl'), placement: 'bottom' as Placement, disableBeacon: true, data: { isTutorial: true, translations } },

            { target: '[data-tour="positioning-canvas"]', content: richText('positioningTryDragLocked'), placement: 'top', disableBeacon: true, spotlightClicks: true, data: { isTutorial: true, translations } },
            { target: '[data-tour="positioning-canvas"]', content: richText('positioningExplainLock'), placement: 'top', disableBeacon: true, data: { isTutorial: true, translations } },
            { target: '[data-tour="strip-link-toggle"]', content: richText('positioningClickUnlink'), placement: 'top', spotlightClicks: true, data: { isTutorial: true, translations } },
            { target: '[data-tour="strip-link-toggle"]', content: richText('positioningConfirmOverride'), placement: 'top', disableBeacon: true, data: { isTutorial: true, translations } },
            { target: '[data-tour="positioning-canvas"]', content: richText('positioningDragOverride'), placement: 'top', disableBeacon: true, spotlightClicks: true, data: { isTutorial: true, translations } },
            { target: '[data-tour="positioning-canvas"]', content: richText('positioningOverrideFinish'), placement: 'top', disableBeacon: true, data: { isTutorial: true, translations } },

            { target: '[data-tour="header-back"]', content: translations.explainBack, spotlightClicks: true, hideFooter: true, data: { isTutorial: true, advanceOn: 'back-to-dashboard', translations } },
            
            { target: '[data-tour="header-creator"]', content: translations.explainCreator, placement: 'bottom' as Placement, data: { isTutorial: true, translations } },
            { target: '[data-tour="header-compare"]', content: translations.explainCompare, placement: 'bottom' as Placement, data: { isTutorial: true, translations } },
            { target: '[data-tour="header-settings"]', content: translations.explainSettings, placement: 'bottom' as Placement, data: { isTutorial: true, translations } },
            { target: '[data-tour="header-export"]', content: translations.explainExport, placement: 'bottom' as Placement, data: { isTutorial: true, translations } },

            { target: 'body', content: richText('threePillarsIntro'), placement: 'center' as Placement, disableBeacon: true, data: { isTutorial: true, translations } },

            { target: '[data-tour="nav-positioning"]', content: translations.positioningNav, spotlightClicks: true, hideFooter: true, data: { isTutorial: true, advanceOn: 'workspace-positioning', translations } },
            { target: 'body', content: translations.positioningIntro, placement: 'center' as Placement, data: { isTutorial: true, translations } },
            { target: '[data-tour="positioning-view-toggle"]', content: translations.positioningViews, placement: 'bottom' as Placement, data: { isTutorial: true, translations } },
            
            {
                target: '[data-tour="start-positioning-rule-A-ͤ"]',
                content: translations.startPositioning,
                spotlightClicks: true,
                hideFooter: true,
                data: { isTutorial: true, translations } 
            },
            
            { target: '[data-tour="combo-card-Aͤ"]', content: translations.positioningPreviewCard, placement: 'top' as Placement, data: { isTutorial: true, translations } },
            { target: '[data-tour="accept-pos-Aͤ"]', content: translations.positioningAccept, spotlightClicks: true, hideFooter: true, data: { isTutorial: true, advanceOn: 'accepted-A-combining', translations } },
            { 
                target: '[data-tour="combo-card-Eͤ"]', 
                content: translations.positioningEdit, 
                spotlightClicks: true, 
                hideFooter: true, 
                data: { isTutorial: true, translations } // removed advanceOn
            },
            { target: '[data-tour="positioning-editor-page"]', content: translations.positioningEditor, data: { isTutorial: true, translations } },
            
            { target: '[data-tour="nav-kerning"]', content: translations.kerningNav, spotlightClicks: true, hideFooter: true, data: { isTutorial: true, advanceOn: 'workspace-kerning', translations } },
            { target: '[data-tour="kerning-tabs"]', content: richText('kerningIntroAndViews'), placement: 'bottom' as Placement, data: { isTutorial: true, translations } },
            
            { 
                target: '[data-tour="pair-card-Te"]', 
                content: translations.kerningManualEdit, 
                spotlightClicks: true, 
                hideFooter: true, 
                data: { isTutorial: true, translations } // removed advanceOn
            },
            // Step 1: The Action (Adjusting Spacing)
            { 
                target: '[data-tour="kerning-canvas"]', 
                content: richText('kerningEditor'), 
                placement: 'top' as Placement, 
                disableBeacon: true, 
                spotlightClicks: true, 
                hideFooter: true, 
                data: { isTutorial: true, advanceOn: 'kerned-Te-action', translations } 
            },
            // Step 2: The Navigation (Exiting)
            { 
                target: '[data-tour="header-back"]', 
                content: translations.kerningClickBack, 
                placement: 'bottom' as Placement,
                spotlightClicks: true, 
                hideFooter: true, 
                data: { isTutorial: true, advanceOn: 'kerning-editor-closed', translations } 
            },
            { target: '[data-tour="tab-spaced"]', content: translations.kerningSpacedTab, placement: 'bottom' as Placement, data: { isTutorial: true, translations } },
            { target: '[data-tour="auto-kern-btn"]', content: richText('kerningAutoTools'), placement: 'bottom' as Placement, data: { isTutorial: true, translations } },
            { target: '[data-tour="tab-all"]', content: translations.kerningAllPairsTab, placement: 'bottom' as Placement, data: { isTutorial: true, translations } },
            
            { target: 'body', content: richText('finalCongratulations'), placement: 'center' as Placement, disableBeacon: true, data: { isTutorial: true, translations } }
        ];

        return steps;
    }, [translations, isLargeScreen]);

    const handleToolChange = useCallback((tool: Tool) => {
        setCurrentTool(tool);
    }, []);
    
    // 2. Initialize Linear Tutorial if active
    useEffect(() => {
        if (script?.id === 'tutorial') {
            const isDismissed = localStorage.getItem('tutorial_dismissed') === 'true';
            setActiveSteps(linearTutorialSteps);
            if (!isDismissed) {
                setRun(true);
            }
        } else {
            // Reset if switching away
            if (activeSteps.length > 0 && activeSteps[0].data?.isTutorial) {
                 setRun(false);
                 setStepIndex(0);
                 setActiveSteps([]);
            }
        }
    }, [script?.id, linearTutorialSteps]);

    // 3. JIT Hint Logic (RESTORED)
    useEffect(() => {
        if (!translations) return;
        if (script?.id === 'tutorial') return;
        
        // Hint 1: Select Character
        if (workspace === 'drawing' && currentView === 'grid' && !selectedCharacter && !activeModal) {
            const storageKey = 'hint_grid_select_seen';
            if (!localStorage.getItem(storageKey)) {
                const checkExist = setInterval(() => {
                   if (document.querySelector('.tutorial-glyph-item')) {
                       clearInterval(checkExist);
                       setActiveSteps([{
                           target: '.tutorial-glyph-item',
                           content: translations.hintGridSelect || "Select a character card to start drawing your font.",
                           disableBeacon: true,
                           placement: 'bottom' as Placement,
                           spotlightClicks: true,
                           data: { isTutorial: false, storageKey: storageKey, translations }
                       }]);
                       setStepIndex(0);
                       setRun(true);
                       // localStorage.setItem(storageKey, 'true'); // Removed: Handled in CustomTooltip on Dismiss
                   }
                }, 500);
                setTimeout(() => clearInterval(checkExist), 5000);
                return () => clearInterval(checkExist);
            }
        }
        
        // Hint 2: Start Drawing
        if (workspace === 'drawing' && selectedCharacter && !activeModal) {
            const storageKey = 'hint_editor_draw_seen';
            if (!localStorage.getItem(storageKey)) {
                const timer = setTimeout(() => {
                    setActiveSteps([{
                       target: '[data-tour="drawing-canvas"]',
                       content: translations.hintEditorDraw || "Start drawing here.",
                       disableBeacon: true,
                       placement: 'top' as Placement,
                       spotlightClicks: true,
                       data: { isTutorial: false, storageKey: storageKey, translations }
                    }]);
                    setStepIndex(0);
                    setRun(true);
                    // localStorage.setItem(storageKey, 'true'); // Removed
                }, 800);
                return () => clearTimeout(timer);
            }
        }
        
        // Hint 3: First Composite Glyph (Exclude Linked Glyphs)
        if (workspace === 'drawing' && selectedCharacter && !activeModal) {
             const isStaticComposite = (selectedCharacter.composite && selectedCharacter.composite.length > 0) && (!selectedCharacter.link);
             
             if (isStaticComposite) {
                 const storageKey = 'hint_composite_seen';
                 if (!localStorage.getItem(storageKey)) {
                     const timer = setTimeout(() => {
                         setActiveSteps([{
                             target: '[data-tour="drawing-canvas"]',
                             content: (
                                 <div>
                                     <h3 className="font-bold text-lg mb-2 text-indigo-600 dark:text-indigo-400">{translations.hintCompositeTitle}</h3>
                                     <p dangerouslySetInnerHTML={{__html: translations.hintCompositeContent}}></p>
                                 </div>
                             ),
                             placement: 'top' as Placement,
                             disableBeacon: true,
                             spotlightClicks: true,
                             data: { isTutorial: false, storageKey: storageKey, translations }
                         }]);
                         setStepIndex(0);
                         setRun(true);
                         // localStorage.setItem(storageKey, 'true'); // Removed
                     }, 1200); 
                     
                     return () => clearTimeout(timer);
                 }
             }
        }

        // Hint 4: First Linked Glyph Intro (Multi-step)
        if (workspace === 'drawing' && selectedCharacter && !activeModal) {
            if (selectedCharacter.link && selectedCharacter.link.length > 0) {
                const storageKey = 'hint_linked_intro_seen';
                if (!localStorage.getItem(storageKey)) {
                     const timer = setTimeout(() => {
                         setActiveSteps([
                             {
                                 target: '[data-tour="drawing-canvas"]',
                                 content: (
                                     <div>
                                         <h3 className="font-bold text-lg mb-2 text-indigo-600 dark:text-indigo-400">{translations.hintLinkedTitle}</h3>
                                         <p dangerouslySetInnerHTML={{__html: translations.hintLinkedContent}}></p>
                                     </div>
                                 ),
                                 placement: 'top' as Placement,
                                 disableBeacon: true,
                                 spotlightClicks: true,
                                 data: { isTutorial: false, translations } 
                             },
                             {
                                 target: '[data-tour="header-unlink"]',
                                 content: translations.hintUnlinkContent,
                                 placement: 'bottom' as Placement,
                                 disableBeacon: true,
                                 data: { isTutorial: false, storageKey: storageKey, translations }
                             }
                         ]);
                         setStepIndex(0);
                         setRun(true);
                         // localStorage.setItem(storageKey, 'true'); // Removed
                     }, 1200);
                     return () => clearTimeout(timer);
                }
            }
        }

        // Hint 5: Relink Action (After Unlinking)
        if (workspace === 'drawing' && selectedCharacter && !activeModal) {
            if (selectedCharacter.sourceLink) {
                const storageKey = 'hint_relink_action_seen';
                if (!localStorage.getItem(storageKey)) {
                     const timer = setTimeout(() => {
                         setActiveSteps([{
                             target: '[data-tour="header-relink"]',
                             content: translations.hintRelinkContent,
                             placement: 'bottom' as Placement,
                             disableBeacon: true,
                             spotlightClicks: true,
                             data: { isTutorial: false, storageKey: storageKey, translations }
                         }]);
                         setStepIndex(0);
                         setRun(true);
                         // localStorage.setItem(storageKey, 'true'); // Removed
                     }, 1000);
                     return () => clearTimeout(timer);
                }
            }
        }

        // Hint 6: Positioned Glyph Intro (Multi-step)
        if (workspace === 'drawing' && selectedCharacter && !activeModal && !selectedCharacter.link) {
            if (selectedCharacter.position && selectedCharacter.position.length > 0) {
                 const storageKey = 'hint_positioned_seen';
                 if (!localStorage.getItem(storageKey)) {
                     const timer = setTimeout(() => {
                         setActiveSteps([
                            {
                                target: '[data-tour="positioning-canvas"]',
                                content: (
                                    <div>
                                        <h3 className="font-bold text-lg mb-2 text-indigo-600 dark:text-indigo-400">{translations.hintPositionedTitle}</h3>
                                        <p dangerouslySetInnerHTML={{__html: translations.hintPositionedContent}}></p>
                                    </div>
                                ),
                                placement: 'top' as Placement,
                                disableBeacon: true,
                                spotlightClicks: true,
                                data: { isTutorial: false, translations }
                            },
                            {
                                target: '[data-tour="header-detach-pos"]',
                                content: translations.hintDetachContent,
                                placement: 'bottom' as Placement,
                                disableBeacon: true,
                                data: { isTutorial: false, translations }
                            },
                            {
                                target: '[data-tour="header-accept-pos"]',
                                content: translations.hintAcceptPosition,
                                placement: 'bottom' as Placement,
                                spotlightClicks: true,
                                disableBeacon: true,
                                data: { isTutorial: false, storageKey: storageKey, translations }
                            }
                         ]);
                         setStepIndex(0);
                         setRun(true);
                         // localStorage.setItem(storageKey, 'true'); // Removed
                     }, 1200);
                     return () => clearTimeout(timer);
                }
            }
        }

        // Hint 7: Kerned Glyph Intro (Multi-step)
        if (workspace === 'drawing' && selectedCharacter && !activeModal && !selectedCharacter.link) {
            if (selectedCharacter.kern && selectedCharacter.kern.length > 0) {
                 const storageKey = 'hint_kerned_seen';
                 if (!localStorage.getItem(storageKey)) {
                     const timer = setTimeout(() => {
                         setActiveSteps([
                            {
                                target: '[data-tour="kerning-canvas"]',
                                content: (
                                    <div>
                                        <h3 className="font-bold text-lg mb-2 text-indigo-600 dark:text-indigo-400">{translations.hintKernedTitle}</h3>
                                        <p dangerouslySetInnerHTML={{__html: translations.hintKernedContent}}></p>
                                    </div>
                                ),
                                placement: 'top' as Placement,
                                disableBeacon: true,
                                spotlightClicks: true,
                                data: { isTutorial: false, translations }
                            },
                            {
                                target: '[data-tour="header-detach-kern"]',
                                content: translations.hintDetachContent,
                                placement: 'bottom' as Placement,
                                disableBeacon: true,
                                data: { isTutorial: false, translations }
                            },
                            {
                                target: '[data-tour="header-accept-kern"]',
                                content: translations.hintAcceptKerning,
                                placement: 'bottom' as Placement,
                                spotlightClicks: true,
                                disableBeacon: true,
                                data: { isTutorial: false, storageKey: storageKey, translations }
                            }
                         ]);
                         setStepIndex(0);
                         setRun(true);
                         // localStorage.setItem(storageKey, 'true'); // Removed
                     }, 1200);
                     return () => clearTimeout(timer);
                 }
            }
        }

        // Hint 8: Kerning Workspace Intro
        if (workspace === 'kerning' && !activeModal) {
            const storageKey = 'hint_kerning_seen';
            if (!localStorage.getItem(storageKey)) {
                const timer = setTimeout(() => {
                    setActiveSteps([{
                        target: '[data-tour="nav-kerning"]', // Updated target
                        content: (
                            <div>
                                <h3 className="font-bold text-lg mb-2 text-indigo-600 dark:text-indigo-400">{translations.hintKerningWorkspaceTitle}</h3>
                                <p>{translations.hintKerningWorkspaceContent}</p>
                            </div>
                        ),
                        placement: 'bottom' as Placement,
                        disableBeacon: true,
                        spotlightClicks: true,
                        data: { isTutorial: false, storageKey: storageKey, translations }
                    }]);
                    setStepIndex(0);
                    setRun(true);
                    // localStorage.setItem(storageKey, 'true'); // Removed
                }, 500);
                return () => clearTimeout(timer);
            }
        }

        // Hint 9: Positioning Workspace Intro (NEW)
        if (workspace === 'positioning' && !activeModal) {
            const storageKey = 'hint_positioning_workspace_seen';
            if (!localStorage.getItem(storageKey)) {
                const timer = setTimeout(() => {
                    setActiveSteps([{
                        target: '[data-tour="nav-positioning"]', // Target the tab in header
                        content: (
                            <div>
                                <h3 className="font-bold text-lg mb-2 text-indigo-600 dark:text-indigo-400">{translations.hintPositioningWorkspaceTitle}</h3>
                                <p>{translations.hintPositioningWorkspaceContent}</p>
                            </div>
                        ),
                        placement: 'bottom' as Placement,
                        disableBeacon: true,
                        spotlightClicks: true,
                        data: { isTutorial: false, storageKey: storageKey, translations }
                    }]);
                    setStepIndex(0);
                    setRun(true);
                    // localStorage.setItem(storageKey, 'true'); // Removed
                }, 500);
                return () => clearTimeout(timer);
            }
        }

    }, [script?.id, workspace, currentView, selectedCharacter, activeModal, translations]);

    // Hint: Related Pairs (Smart Class) - Polling approach (RESTORED)
    useEffect(() => {
        const storageKey = 'hint_related_pairs_seen';
        if (localStorage.getItem(storageKey) || !translations) return;

        const checkExist = setInterval(() => {
            const strip = document.querySelector('[data-tour="related-pairs-strip"]');
            if (strip && !activeModal && !run) {
                clearInterval(checkExist);
                 setActiveSteps([
                     {
                         target: '[data-tour="related-pairs-strip"]',
                         title: translations.hintRelatedPairsTitle,
                         content: translations.hintRelatedPairsContent,
                         placement: 'top' as Placement,
                         disableBeacon: true,
                         spotlightClicks: true,
                         data: { isTutorial: false, translations }
                     },
                     {
                         target: '[data-tour="strip-link-toggle"]',
                         title: translations.hintOverrideTitle,
                         content: translations.hintOverrideContent,
                         placement: 'top' as Placement, 
                         disableBeacon: true,
                         data: { isTutorial: false, storageKey: storageKey, translations }
                     }
                 ]);
                 setStepIndex(0);
                 setRun(true);
                 // localStorage.setItem(storageKey, 'true'); // Removed
            }
        }, 1000); 

        return () => clearInterval(checkExist);
    }, [run, activeModal, translations]); 

    // 4. JIT Cleanup Logic (RESTORED)
    useEffect(() => {
        if (run && activeSteps.length > 0 && !activeSteps[0].data?.isTutorial) {
             const currentStepTarget = activeSteps[0].target as string;
             // Only auto-close single-step simple hints if context changes
             if (currentStepTarget === '.tutorial-glyph-item' && selectedCharacter) {
                 setRun(false);
                 setActiveSteps([]);
             }
             if (currentStepTarget === '[data-tour="drawing-canvas"]' && !selectedCharacter) {
                 setRun(false);
                 setActiveSteps([]);
             }
             // Auto-close kerning hint if workspace changes
             if (currentStepTarget === '[data-tour="nav-kerning"]' && workspace !== 'kerning') {
                 setRun(false);
                 setActiveSteps([]);
             }
             // Auto-close positioning hint if workspace changes
             if (currentStepTarget === '[data-tour="nav-positioning"]' && workspace !== 'positioning') {
                 setRun(false);
                 setActiveSteps([]);
             }
        }
    }, [run, activeSteps, selectedCharacter, workspace]);

    // 5. Linear Tutorial State Machine (Advancement Logic)
    useEffect(() => {
        if (!run || script?.id !== 'tutorial' || activeSteps.length === 0) return;

        const currentStep = activeSteps[stepIndex];
        if (!currentStep) return;

        // Proactive Click Interception for "Transition Steps"
        // This is the CRITICAL FIX for the race condition crash.
        const isTransitionToEditor = currentStep.target === '[data-tour="combo-card-Eͤ"]';
        const isTransitionToKerning = currentStep.target === '[data-tour="pair-card-Te"]';
        const isTransitionBack = currentStep.target === '[data-tour="header-back"]';
        
        if (isTransitionToEditor || isTransitionToKerning || isTransitionBack) {
             const selector = currentStep.target as string;
             
             const handleProactiveClick = (e: MouseEvent) => {
                 const target = e.target as HTMLElement;
                 if (target.closest(selector)) {
                     // Capture the click event before React unmounts the view
                     // Pause the tour explicitly to prevent TARGET_NOT_FOUND
                     setRun(false);
                     // Advance the step index so when we resume, we are on the next step
                     setStepIndex(prev => prev + 1);
                 }
             };

             // Use capture phase to ensure we catch it before React bubbles it up/unmounts
             document.addEventListener('click', handleProactiveClick, true);
             
             return () => {
                 document.removeEventListener('click', handleProactiveClick, true);
             };
        }

        // Passive Polling for View Transition (Fix for Race Condition on Grid Load)
        if (currentStep.target === '[data-tour="start-positioning-rule-A-ͤ"]') {
             const interval = setInterval(() => {
                 // Check if the destination element (the combo card in the grid view) has appeared
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
    }, [stepIndex, selectedCharacter, activeModal, run, script?.id, activeSteps, isNavDrawerOpen, currentTool, workspace, allCharsByName, markPositioningMap, kerningMap]);

    const handleCallback = (data: CallBackProps) => {
        const { status, type, action, index, step } = data;
        
        // Robust Error Handling
        if (type === EVENTS.TARGET_NOT_FOUND) {
             const stepTarget = activeSteps[index]?.target;
             
             // If we are waiting for the grid view to load, ignore this error
             if (stepTarget === '[data-tour="start-positioning-rule-A-ͤ"]') {
                 return; 
             }
             
             // For Editor Pages, if target is not found, pause and wait for 'view-loaded' event
             if (stepTarget === '[data-tour="positioning-editor-page"]' || stepTarget === '[data-tour="kerning-canvas"]') {
                 setRun(false);
                 return;
             }

             // FIX: Mobile Navigation Race Condition
             // If the "Back" button is gone, it likely means we successfully navigated back.
             if (stepTarget === '[data-tour="header-back"]') {
                 // Check if we are actually back at dashboard (no active modal)
                 if (!activeModal && !selectedCharacter) {
                     setStepIndex(prev => prev + 1);
                     // CRITICAL: Force resume immediately to prevent "stop" behavior
                     setTimeout(() => setRun(true), 100);
                 }
                 return;
             }
        }
        
        if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
            setRun(false);
            if (script?.id === 'tutorial') {
                setStepIndex(0);
                // Fix: Clear active steps on Exit to prevent auto-resume from restarting the tour immediately
                if (status === STATUS.SKIPPED) {
                    setActiveSteps([]);
                }
            } else {
                setActiveSteps([]); // Clear JIT steps
            }
        } else if (type === EVENTS.STEP_AFTER) {
            const currentStep = activeSteps[index];

            if (!currentStep.data?.isTutorial && action === ACTIONS.NEXT) {
                 setStepIndex(index + 1);
                 return;
            }

            if (script?.id === 'tutorial') {
                const currentStep = activeSteps[index];
                if (!currentStep) return;

                if (!currentStep.data?.advanceOn) {
                    if (action === ACTIONS.NEXT) {
                        setStepIndex(index + 1);
                    }
                }
                if (action === ACTIONS.PREV) {
                    setStepIndex(index - 1);
                }
            }
        }
    };

    if (!translations || activeSteps.length === 0) return null;

    return (
        <>
            {activeModal && <TutorialStateProvider onToolChange={handleToolChange} />}
            <Joyride
                steps={activeSteps}
                run={run}
                stepIndex={stepIndex}
                continuous
                showProgress={activeSteps.length > 1}
                showSkipButton
                callback={handleCallback}
                tooltipComponent={CustomTooltip}
                scrollOffset={scrollOffset}
                disableOverlayClose={true}
                spotlightPadding={4}
                styles={{
                    options: {
                        arrowColor: theme === 'dark' ? '#1f2937' : '#fff',
                        zIndex: 10000,
                        primaryColor: '#4f46e5' 
                    },
                    overlay: {
                        backgroundColor: 'rgba(0, 0, 0, 0.6)'
                    },
                    beaconInner: {
                        backgroundColor: '#EF4444',
                    },
                    beaconOuter: {
                        borderColor: '#EF4444',
                    },
                }}
                locale={{
                    last: translations.last || 'Finish',
                    skip: translations.skip || 'Skip',
                }}
            />
        </>
    );
};

export default TutorialManager;
