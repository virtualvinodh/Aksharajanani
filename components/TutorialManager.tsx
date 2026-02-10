
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Joyride, { CallBackProps, STATUS, Step, EVENTS, ACTIONS, TooltipRenderProps } from 'react-joyride';
import { useProject } from '../contexts/ProjectContext';
import { useGlyphData } from '../contexts/GlyphDataContext';
import { useLayout } from '../contexts/LayoutContext';
import { useTheme } from '../contexts/ThemeContext';
import { useLocale } from '../contexts/LocaleContext';
import { useMediaQuery } from '../hooks/useMediaQuery';

// Custom Tooltip Component to handle "Don't Show Again" vs "Skip"
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
    const performDismiss = (e?: React.SyntheticEvent) => {
        // Main Tutorial Logic
        if (step.data?.isTutorial) {
             localStorage.setItem('tutorial_dismissed', 'true');
        } 
        // JIT Hint Logic
        else if (step.data?.storageKey) {
             localStorage.setItem(step.data.storageKey, 'true');
        }
        
        // Pass event if exists, or a dummy object for the timer call
        const safeEvent = e || { 
            preventDefault: () => {}, 
            stopPropagation: () => {},
            currentTarget: { blur: () => {} }
        } as any;

        if (skipProps && typeof skipProps.onClick === 'function') {
            skipProps.onClick(safeEvent); 
        }
    };

    const handlePrimaryClick = (e: React.SyntheticEvent) => {
        // For JIT hints (single step), treat "OK" as a dismissal to ensure it closes reliably.
        if (!step.data?.isTutorial && isLastStep) {
            performDismiss(e);
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
                dismissRef.current();
            }
        }, 15000); // 15 seconds (increased for multi-step readability)

        return () => clearTimeout(timer);
        // Empty dependency array: We only start the timer when this specific tooltip MOUNTS.
        // We do NOT want to reset the timer on re-renders.
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
                           <button {...skipProps} onClick={(e) => performDismiss(e)} className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 text-xs font-bold uppercase tracking-wider transition-colors">
                               {step.data?.isTutorial ? (labels.skip || 'Skip') : (labels.close || 'Close')}
                           </button>
                      )}
                   </div>
                   <div className="flex gap-2">
                       {index > 0 && (
                          <button {...backProps} className="px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                             {labels.back || 'Back'}
                          </button>
                       )}
                       {/* Hide "Next" button if the step requires interaction (hideFooter is not enough for custom tooltips) */}
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
              
              {/* Show for JIT hints only, NOT for main tutorial */}
              {!step.data?.isTutorial && (
                  <div className="border-t border-gray-100 dark:border-gray-700 pt-3 text-center">
                      <button 
                          onClick={(e) => performDismiss(e)}
                          className="text-[10px] text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 transition-colors"
                      >
                          {labels.dontShowAgain || "Don't show me this again"}
                      </button>
                  </div>
              )}
         </div>
      </div>
    );
};

const TutorialManager: React.FC = () => {
    const { script } = useProject();
    const { selectedCharacter, activeModal, workspace, currentView, isNavDrawerOpen } = useLayout();
    const { theme } = useTheme();
    const { locale } = useLocale();
    
    const [run, setRun] = useState(false);
    const [stepIndex, setStepIndex] = useState(0);
    const [translations, setTranslations] = useState<Record<string, string> | null>(null);
    const [activeSteps, setActiveSteps] = useState<Step[]>([]);
    
    const isLargeScreen = useMediaQuery('(min-width: 1024px)');

    // Dynamic offset state
    const [scrollOffset, setScrollOffset] = useState(150);
    
    // Calculate offset based on current UI state
    const updateScrollOffset = useCallback(() => {
        let total = 0;
        
        // 1. Global Header
        const appHeader = document.querySelector('header');
        if (appHeader) total += appHeader.getBoundingClientRect().height;
        
        // 2. Workspace Headers (DrawingWorkspace header has z-20)
        const z20Headers = document.querySelectorAll('.z-20');
        z20Headers.forEach(el => {
            // Only count if it's top-aligned (part of the header stack)
            if (el.getBoundingClientRect().top < 200) {
                 total += el.clientHeight;
            }
        });
        
        // 3. Progress Bar Container
        const progressBar = document.querySelector('[role="progressbar"]');
        if (progressBar) {
            const container = progressBar.closest('.border-b');
            if (container) total += container.clientHeight;
        }

        // 4. Sticky Grid Header (inside Virtual List)
        const sticky = document.querySelector('.sticky.top-0');
        if (sticky) total += sticky.clientHeight;

        // Default safety buffer if calculation fails or returns low
        const finalOffset = Math.max(total + 30, 200); 
        setScrollOffset(finalOffset);
    }, []);

    // Recalculate offset when layout contexts change
    useEffect(() => {
        // Small delay to allow DOM to settle
        const timer = setTimeout(updateScrollOffset, 200);
        return () => clearTimeout(timer);
    }, [workspace, currentView, selectedCharacter, stepIndex, updateScrollOffset]);

    // Fetch translations
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

    // 1. Define Linear Tutorial Steps
    const linearTutorialSteps: Step[] = useMemo(() => {
        if (!translations) return [];
        
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
                placement: 'center',
                disableBeacon: true,
                data: { isTutorial: true, translations }
            },
            // 1. Click 'A' (Interaction)
            {
                target: '[data-tour="grid-item-0"]',
                content: translations.clickFirstChar,
                spotlightClicks: true,
                disableBeacon: true,
                hideFooter: true, 
                data: { isTutorial: true, advanceOn: 'selected-A', translations }
            },
            // 2. Highlight Pen Tool
            {
                target: '[data-tour="toolbar-pen"]',
                content: translations.toolbarPenContent,
                placement: 'right',
                disableBeacon: true, 
                spotlightClicks: true, 
                data: { isTutorial: true, translations }
            },
            // 3. Draw on Canvas (Wait for draw)
            {
                target: '[data-tour="drawing-canvas"]',
                content: translations.drawContent,
                placement: 'right',
                disableBeacon: true,
                spotlightClicks: true,
                disableOverlayClose: true,
                data: { isTutorial: true, translations }
            }
        ];

        // --- BRANCH: TEST PAGE ACCESS ---
        if (!isLargeScreen) {
             // Mobile: Must go back to dashboard first
             steps.push({
                target: '[data-tour="header-back"]',
                content: translations.clickBackToDashboard,
                spotlightClicks: true,
                // Beacon enabled
                hideFooter: true,
                data: { isTutorial: true, advanceOn: 'back-to-dashboard', translations }
             });
        }
        
        steps.push({
            target: '[data-tour="header-test"]',
            content: translations.clickTest,
            spotlightClicks: true,
            // Beacon enabled
            hideFooter: true,
            data: { isTutorial: true, advanceOn: 'test-modal-open', translations }
        });

        steps.push({
            target: '[data-tour="test-page-input"]',
            content: translations.testPageInput,
            placement: 'bottom',
            disableBeacon: true,
            spotlightClicks: true,
            data: { isTutorial: true, translations }
        });

        steps.push({
            target: '[data-tour="test-page-close"]',
            content: translations.closeTestPage,
            spotlightClicks: true,
            disableBeacon: true,
            hideFooter: true,
            data: { isTutorial: true, advanceOn: 'test-modal-close', translations }
        });

        // --- BRANCH: SELECT 'F' ---
        if (!isLargeScreen) {
            // Mobile: Must re-enter editor via 'A' (or any), then open drawer
            steps.push({
                target: '[data-tour="grid-item-0"]', // Use A as entry point again
                content: translations.clickAAgain,
                spotlightClicks: true,
                disableBeacon: true,
                hideFooter: true,
                data: { isTutorial: true, advanceOn: 're-enter-editor', translations }
            });
            steps.push({
                target: '[data-tour="floating-grid-btn"]',
                content: translations.openGrid,
                spotlightClicks: true,
                disableBeacon: true,
                hideFooter: true,
                data: { isTutorial: true, advanceOn: 'drawer-open', translations }
            });
            // Drawer open -> Select F
             steps.push({
                target: '#mobile-nav-drawer [data-tour="grid-item-1"]', // Scoped to Drawer ID to avoid conflict
                content: translations.selectCharF,
                spotlightClicks: true,
                disableBeacon: true,
                hideFooter: true,
                placement: 'right', // Drawer is on left, so tooltip goes right
                data: { isTutorial: true, advanceOn: 'selected-F', translations }
            });
        } else {
            // Desktop: Select F from sidebar directly
             steps.push({
                target: '[data-tour="grid-item-1"]', // F in sidebar
                content: translations.selectCharF,
                spotlightClicks: true,
                disableBeacon: true,
                hideFooter: true,
                placement: 'right',
                data: { isTutorial: true, advanceOn: 'selected-F', translations }
            });
        }

        // Common Finish
        steps.push({
            target: '[data-tour="drawing-canvas"]',
            content: translations.drawCharF,
            placement: 'right',
            disableBeacon: true,
            spotlightClicks: true,
            disableOverlayClose: true,
            data: { isTutorial: true, translations }
        });
        
        steps.push({
            target: '[data-tour="tool-select"]',
            content: translations.toolSelectPan,
            placement: 'top',
            disableBeacon: true,
            data: { isTutorial: true, translations }
        });

        steps.push({
            target: '[data-tour="tool-eraser"]',
            content: translations.toolEraser,
            placement: 'top',
            disableBeacon: true,
            data: { isTutorial: true, translations }
        });

        steps.push({
            target: '[data-tour="action-undo"]',
            content: translations.actionUndo,
            placement: 'top',
            disableBeacon: true,
            data: { isTutorial: true, translations }
        });

        steps.push({
            target: '[data-tour="action-group"]',
            content: translations.actionGroup,
            placement: 'top',
            disableBeacon: true,
            data: { isTutorial: true, translations }
        });

        steps.push({
            target: '[data-tour="header-next"]',
            content: translations.clickNextForComposite,
            spotlightClicks: true,
            // Beacon enabled
            hideFooter: true,
            data: { isTutorial: true, advanceOn: 'selected-E', translations }
        });

        steps.push({
            target: 'body',
            content: translations.compositeExplanation,
            placement: 'center',
            disableBeacon: true,
            data: { isTutorial: true, translations }
        });
        
        // Draw the composite parts
        steps.push({
            target: '[data-tour="drawing-canvas"]',
            content: translations.drawComposite,
            placement: 'right',
            disableBeacon: true,
            spotlightClicks: true,
            disableOverlayClose: true,
            data: { isTutorial: true, translations }
        });

        // --- NEW LINKED GLYPHS SECTION ---
        
        // Navigate to 'e'
        steps.push({
            target: '[data-tour="header-next"]',
            content: translations.clickNextForLowerE,
            spotlightClicks: true,
            // Beacon enabled
            hideFooter: true,
            data: { isTutorial: true, advanceOn: 'selected-e', translations }
        });
        
        // Draw 'e'
        steps.push({
            target: '[data-tour="drawing-canvas"]',
            content: translations.drawLowerE,
            placement: 'right',
            disableBeacon: true,
            spotlightClicks: true,
            disableOverlayClose: true,
            data: { isTutorial: true, translations }
        });
        
        // Navigate to Combining Mark (Linked)
        steps.push({
            target: '[data-tour="header-next"]',
            content: translations.clickNextForLinked,
            spotlightClicks: true,
            // Beacon enabled
            hideFooter: true,
            data: { isTutorial: true, advanceOn: 'selected-combining', translations }
        });
        
        // Explain Linking
        steps.push({
            target: 'body',
            content: translations.linkedExplanation,
            placement: 'center',
            disableBeacon: true,
            data: { isTutorial: true, translations }
        });

        // New Step: Point out the bottom strip for navigation
        steps.push({
            target: '[data-tour="linked-source-strip"]',
            content: translations.linkedStripNav,
            placement: 'top',
            disableBeacon: true,
            data: { isTutorial: true, translations }
        });

        // Explain Transforming Linked Glyph
        steps.push({
            target: '[data-tour="drawing-canvas"]',
            content: translations.transformLinked,
            placement: 'right',
            disableBeacon: true,
            spotlightClicks: true, 
            data: { isTutorial: true, translations }
        });

        // Navigate Back
        steps.push({
            target: '[data-tour="header-prev"]',
            content: translations.clickPrevForModification,
            spotlightClicks: true,
            // Beacon enabled
            hideFooter: true,
            data: { isTutorial: true, advanceOn: 'selected-e', translations }
        });
        
        // Modify Source
        steps.push({
            target: '[data-tour="drawing-canvas"]',
            content: translations.modifyLowerE,
            placement: 'right',
            disableBeacon: true,
            spotlightClicks: true,
            disableOverlayClose: true,
            data: { isTutorial: true, translations }
        });
        
        // Return to Verify
        steps.push({
            target: '[data-tour="header-next"]',
            content: translations.clickNextToVerify,
            spotlightClicks: true,
            // Beacon enabled
            hideFooter: true,
            data: { isTutorial: true, advanceOn: 'selected-combining', translations }
        });
        
        // Conclusion of Linking
        steps.push({
            target: '[data-tour="drawing-canvas"]',
            content: translations.verifyLink,
            placement: 'right',
            disableBeacon: true,
            data: { isTutorial: true, translations }
        });
        
        // --- SMART POSITIONING SECTION ---
        
        // Go to 'n'
        steps.push({
            target: '[data-tour="header-next"]',
            content: translations.clickNextForN,
            spotlightClicks: true,
            // Beacon enabled
            hideFooter: true,
            data: { isTutorial: true, advanceOn: 'selected-n', translations }
        });

        // Draw 'n'
        steps.push({
            target: '[data-tour="drawing-canvas"]',
            content: translations.drawN,
            placement: 'right',
            disableBeacon: true,
            spotlightClicks: true,
            disableOverlayClose: true,
            data: { isTutorial: true, translations }
        });

        // Go to Tilde
        steps.push({
            target: '[data-tour="header-next"]',
            content: translations.clickNextForTilde,
            spotlightClicks: true,
            // Beacon enabled
            hideFooter: true,
            data: { isTutorial: true, advanceOn: 'selected-tilde', translations }
        });

        // Draw Tilde
        steps.push({
            target: '[data-tour="drawing-canvas"]',
            content: translations.drawTilde,
            placement: 'right',
            disableBeacon: true,
            spotlightClicks: true,
            disableOverlayClose: true,
            data: { isTutorial: true, translations }
        });

        // Go to Macron
        steps.push({
            target: '[data-tour="header-next"]',
            content: translations.clickNextForMacron,
            spotlightClicks: true,
            // Beacon enabled
            hideFooter: true,
            data: { isTutorial: true, advanceOn: 'selected-macron', translations }
        });

        // Draw Macron
        steps.push({
            target: '[data-tour="drawing-canvas"]',
            content: translations.drawMacron,
            placement: 'right',
            disableBeacon: true,
            spotlightClicks: true,
            disableOverlayClose: true,
            data: { isTutorial: true, translations }
        });

        // Go to n-tilde (Positioning Mode)
        steps.push({
            target: '[data-tour="header-next"]',
            content: translations.clickNextForNTilde,
            spotlightClicks: true,
            // Beacon enabled
            hideFooter: true,
            data: { isTutorial: true, advanceOn: 'selected-ntilde', translations }
        });

        // Explain Positioning
        steps.push({
            target: '[data-tour="positioning-canvas"]',
            content: translations.positioningIntro,
            placement: 'right',
            disableBeacon: true,
            spotlightClicks: true,
            disableOverlayClose: true,
            data: { isTutorial: true, translations }
        });

        // Explain Smart Classes
        steps.push({
            target: '[data-tour="related-pairs-strip"]',
            content: translations.smartClassExpl,
            placement: 'top',
            disableBeacon: true,
            data: { isTutorial: true, translations }
        });

        // Explain Unlinking
        steps.push({
            target: '[data-tour="strip-link-toggle"]',
            content: translations.unlinkExpl,
            placement: 'top',
            disableBeacon: true,
            data: { isTutorial: true, translations }
        });

        // Explain Detach
        steps.push({
            target: '[data-tour="header-detach-pos"]',
            content: translations.detachExpl,
            placement: 'bottom',
            disableBeacon: true,
            data: { isTutorial: true, translations }
        });
        
        // Go back to dashboard (Transition Step)
        steps.push({
            target: '[data-tour="header-back"]',
            content: translations.explainBack,
            spotlightClicks: true,
            // Beacon enabled
            hideFooter: true,
            data: { isTutorial: true, advanceOn: 'back-to-dashboard', translations }
        });
        
        // --- FINAL HEADER TOUR (After returning to grid) ---
        
        // Creator Studio
        steps.push({
            target: '[data-tour="header-creator"]',
            content: translations.explainCreator,
            spotlightClicks: true,
            // Beacon enabled
            data: { isTutorial: true, translations }
        });

        // Compare
        steps.push({
            target: '[data-tour="header-compare"]',
            content: translations.explainCompare,
            spotlightClicks: true,
            // Beacon enabled
            data: { isTutorial: true, translations }
        });

        // Settings
        steps.push({
            target: '[data-tour="header-settings"]',
            content: translations.explainSettings,
            spotlightClicks: true,
            // Beacon enabled
            data: { isTutorial: true, translations }
        });

        // Export (The Big Finish)
        steps.push({
            target: '[data-tour="header-export"]',
            content: translations.explainExport,
            spotlightClicks: true,
            // Beacon enabled
            data: { isTutorial: true, translations }
        });

        // Final Step
        steps.push({
            target: 'body',
            content: translations.finish,
            placement: 'center',
            disableBeacon: true,
            data: { isTutorial: true, translations }
        });

        return steps;
    }, [translations, isLargeScreen]);

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

    // 3. JIT Hint Logic (Omitted for brevity, logic remains identical to original)
    // ... [JIT HINT LOGIC HERE] ...

    // 5. Linear Tutorial State Machine (Advancement Logic)
    useEffect(() => {
        if (!run || script?.id !== 'tutorial' || activeSteps.length === 0) return;

        const currentStep = activeSteps[stepIndex];
        if (!currentStep) return;

        const advanceRule = currentStep.data?.advanceOn;

        if (!advanceRule) return;

        const advance = () => setTimeout(() => setStepIndex(prev => prev + 1), 500);

        switch (advanceRule) {
            case 'selected-A':
                if (selectedCharacter) advance();
                break;
            case 'back-to-dashboard':
                if (!activeModal && !selectedCharacter) advance();
                break;
            case 'test-modal-open':
                if (activeModal?.name === 'testPage') advance();
                break;
            case 'test-modal-close':
                if (activeModal === null) advance();
                break;
            case 're-enter-editor':
                if (selectedCharacter) advance();
                break;
            case 'drawer-open':
                if (isNavDrawerOpen) advance();
                break;
            case 'selected-F':
                if (selectedCharacter?.name === 'F') {
                     advance();
                }
                break;
            case 'selected-E':
                if (selectedCharacter?.name === 'E') advance();
                break;
            case 'selected-e':
                if (selectedCharacter?.name === 'e') advance();
                break;
            case 'selected-combining':
                if (selectedCharacter?.name === 'ͤ') advance(); // Checking the specific character
                break;
            // NEW ADVANCE RULES for Positioning
            case 'selected-n':
                if (selectedCharacter?.name === 'n') advance();
                break;
            case 'selected-tilde':
                if (selectedCharacter?.name === '̃') advance();
                break;
            case 'selected-macron':
                if (selectedCharacter?.name === '̄') advance();
                break;
            case 'selected-ntilde':
                if (selectedCharacter?.name === 'ñ') advance();
                break;
        }
    }, [stepIndex, selectedCharacter, activeModal, run, script?.id, activeSteps, isNavDrawerOpen]);

    const handleCallback = (data: CallBackProps) => {
        const { status, type, action, index } = data;
        
        if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
            setRun(false);
            if (script?.id === 'tutorial') {
                setStepIndex(0);
            } else {
                setActiveSteps([]); // Clear JIT steps
            }
        } else if (type === EVENTS.STEP_AFTER || type === EVENTS.TARGET_NOT_FOUND) {
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
                beacon: {
                    inner: '#EF4444', 
                    outer: '#EF4444'
                }
            }}
            locale={{
                last: translations.last || 'Finish',
                skip: translations.skip || 'Skip',
            }}
        />
    );
};

export default TutorialManager;
