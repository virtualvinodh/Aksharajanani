
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Joyride, { CallBackProps, STATUS, Step, EVENTS, ACTIONS, TooltipRenderProps } from 'react-joyride';
import { useProject } from '../contexts/ProjectContext';
import { useGlyphData } from '../contexts/GlyphDataContext';
import { useLayout } from '../contexts/LayoutContext';
import { useTheme } from '../contexts/ThemeContext';
import { useLocale } from '../contexts/LocaleContext';

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
        if (!step.data?.isTutorial) {
            performDismiss(e);
        } else {
            // For the main linear tutorial, use the standard navigation
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
        }, 10000); // 10 seconds

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
                               {step.data?.isTutorial ? 'Skip' : 'Close'}
                           </button>
                      )}
                   </div>
                   <div className="flex gap-2">
                       {index > 0 && (
                          <button {...backProps} className="px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                             Back
                          </button>
                       )}
                       {/* Hide "Next" button if the step requires interaction (hideFooter is not enough for custom tooltips) */}
                       {!step.hideFooter && (
                           <button 
                                {...primaryProps} 
                                onClick={handlePrimaryClick}
                                className="px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 shadow-md transition-all active:scale-95"
                           >
                              {isLastStep ? (step.data?.isTutorial ? 'Finish' : 'OK') : 'Next'}
                           </button>
                       )}
                   </div>
              </div>
              
              {/* Show for both Tutorial AND JIT hints now */}
              <div className="border-t border-gray-100 dark:border-gray-700 pt-3 text-center">
                  <button 
                      onClick={(e) => performDismiss(e)}
                      className="text-[10px] text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 transition-colors"
                  >
                      Don't show me this again
                  </button>
              </div>
         </div>
      </div>
    );
};

const TutorialManager: React.FC = () => {
    const { script } = useProject();
    const { selectedCharacter, activeModal, workspace, currentView } = useLayout();
    const { theme } = useTheme();
    const { locale } = useLocale();
    
    const [run, setRun] = useState(false);
    const [stepIndex, setStepIndex] = useState(0);
    const [translations, setTranslations] = useState<Record<string, string> | null>(null);
    const [activeSteps, setActiveSteps] = useState<Step[]>([]);
    
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
        return [
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
                data: { isTutorial: true }
            },
            // 1. Click 'A' (Interaction)
            {
                target: '[data-tour="grid-item-0"]',
                content: translations.clickFirstChar,
                spotlightClicks: true,
                disableBeacon: true,
                hideFooter: true, 
                data: { isTutorial: true }
            },
            // 2. Highlight Pen Tool
            {
                target: '[data-tour="toolbar-pen"]',
                content: translations.toolbarPenContent,
                placement: 'right',
                disableBeacon: true, 
                spotlightClicks: true, 
                data: { isTutorial: true }
            },
            // 3. Draw on Canvas (Wait for draw)
            {
                target: '[data-tour="drawing-canvas"]',
                content: translations.drawContent,
                placement: 'right',
                disableBeacon: true,
                spotlightClicks: true,
                disableOverlayClose: true,
                data: { isTutorial: true }
            },
            // 4. Click Test (Interaction)
            {
                target: '[data-tour="header-test"]',
                content: translations.clickTest,
                spotlightClicks: true,
                disableBeacon: true,
                hideFooter: true,
                data: { isTutorial: true }
            },
            // 5. Test Input
            {
                target: '[data-tour="test-page-input"]',
                content: translations.testPageInput,
                placement: 'bottom',
                disableBeacon: true,
                spotlightClicks: true,
                data: { isTutorial: true }
            },
            // 6. Close Test (Interaction)
            {
                target: '[data-tour="test-page-close"]',
                content: translations.closeTestPage,
                spotlightClicks: true,
                disableBeacon: true,
                hideFooter: true,
                data: { isTutorial: true }
            },
            // 7. Select 'F' (Interaction - Replaces "Back")
            {
                target: '[data-tour="grid-item-1"]', // Targets F in the grid (sidebar or main)
                content: translations.selectCharF,
                spotlightClicks: true,
                disableBeacon: true,
                hideFooter: true, // User must click 'F'
                placement: 'right',
                data: { isTutorial: true }
            },
            // 8. Draw 'F' (Interaction - Wait for draw)
            {
                target: '[data-tour="drawing-canvas"]',
                content: translations.drawCharF,
                placement: 'right',
                disableBeacon: true,
                spotlightClicks: true,
                disableOverlayClose: true,
                data: { isTutorial: true }
            },
            // 9. Select/Pan (Tools start)
            {
                target: '[data-tour="tool-select"]',
                content: translations.toolSelectPan,
                placement: 'top',
                disableBeacon: true,
                data: { isTutorial: true }
            },
            // 10. Eraser
            {
                target: '[data-tour="tool-eraser"]',
                content: translations.toolEraser,
                placement: 'top',
                disableBeacon: true,
                data: { isTutorial: true }
            },
            // 11. Undo/Redo
            {
                target: '[data-tour="action-undo"]',
                content: translations.actionUndo,
                placement: 'top',
                disableBeacon: true,
                data: { isTutorial: true }
            },
            // 12. Group/Copy
            {
                target: '[data-tour="action-group"]',
                content: translations.actionGroup,
                placement: 'top',
                disableBeacon: true,
                data: { isTutorial: true }
            },
            // 13. Click Next Arrow (Interaction)
            {
                target: '[data-tour="header-next"]',
                content: translations.clickNextForComposite,
                spotlightClicks: true,
                disableBeacon: true,
                hideFooter: true,
                data: { isTutorial: true }
            },
            // 14. Explain Composite
            {
                target: 'body',
                content: translations.compositeExplanation,
                placement: 'center',
                disableBeacon: true,
                data: { isTutorial: true }
            },
            // 15. Finish
            {
                target: 'body',
                content: translations.finish,
                placement: 'center',
                disableBeacon: true,
                data: { isTutorial: true }
            }
        ];
    }, [translations]);

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

    // 3. JIT Hint Logic
    useEffect(() => {
        if (!translations) return;
        
        // Disable hints if we are in the main tutorial script (to avoid conflicts)
        if (script?.id === 'tutorial') return;

        // Hint 1: Select Character (Grid View)
        // Trigger: Drawing Workspace + Grid View + No Selection
        if (workspace === 'drawing' && currentView === 'grid' && !selectedCharacter && !activeModal) {
            const storageKey = 'hint_grid_select_seen';
            const permanentlyDismissed = localStorage.getItem(storageKey);
            const sessionSeen = sessionStorage.getItem(storageKey);
            
            if (!permanentlyDismissed && !sessionSeen) {
                // Ensure grid items are rendered. React-Virtuoso might take a tick.
                const checkExist = setInterval(() => {
                   if (document.querySelector('.tutorial-glyph-item')) {
                       clearInterval(checkExist);
                       
                       setActiveSteps([{
                           target: '.tutorial-glyph-item', // Targets first card regardless of ID
                           content: translations.hintGridSelect || "Select a character to start.",
                           disableBeacon: true,
                           placement: 'bottom',
                           spotlightClicks: true,
                           data: { isTutorial: false, storageKey: storageKey }
                       }]);
                       setStepIndex(0);
                       setRun(true);
                       
                       // Mark as seen for this session immediately to prevent loop
                       sessionStorage.setItem(storageKey, 'true');
                   }
                }, 500);
                setTimeout(() => clearInterval(checkExist), 5000); // 5s timeout
                
                return () => clearInterval(checkExist);
            }
        }

        // Hint 2: Start Drawing (Editor View)
        // Trigger: Drawing Workspace + Character Selected
        if (workspace === 'drawing' && selectedCharacter && !activeModal) {
            const storageKey = 'hint_editor_draw_seen';
            const permanentlyDismissed = localStorage.getItem(storageKey);
            const sessionSeen = sessionStorage.getItem(storageKey);
            
            if (!permanentlyDismissed && !sessionSeen) {
                // Wait for transition/animation
                const timer = setTimeout(() => {
                    setActiveSteps([{
                       target: '[data-tour="drawing-canvas"]',
                       content: translations.hintEditorDraw || "Start drawing here.",
                       disableBeacon: true,
                       placement: 'top', // Or 'center' if canvas is large
                       spotlightClicks: true,
                       data: { isTutorial: false, storageKey: storageKey }
                    }]);
                    setStepIndex(0);
                    setRun(true);
                    
                    // Mark as seen for this session
                    sessionStorage.setItem(storageKey, 'true');
                }, 800);
                return () => clearTimeout(timer);
            }
        }

    }, [script?.id, workspace, currentView, selectedCharacter, activeModal, translations]);
    
    // 4. JIT Cleanup Logic
    // If a hint is active but the condition is no longer met (e.g. user selected character), stop the tour immediately.
    useEffect(() => {
        if (run && activeSteps.length > 0 && !activeSteps[0].data?.isTutorial) {
             const currentStepTarget = activeSteps[0].target as string;
             
             // If hinting "Select Grid" but user has selected a character, stop.
             if (currentStepTarget === '.tutorial-glyph-item' && selectedCharacter) {
                 setRun(false);
                 setActiveSteps([]);
             }
             
             // If hinting "Draw" but user navigates away, stop.
             if (currentStepTarget === '[data-tour="drawing-canvas"]' && !selectedCharacter) {
                 setRun(false);
                 setActiveSteps([]);
             }
        }
    }, [run, activeSteps, selectedCharacter]);

    // 5. Linear Tutorial State Machine (Advancement Logic)
    useEffect(() => {
        // Only run this logic if we are running the main tutorial
        if (!run || script?.id !== 'tutorial') return;

        // Step 1: "Click the first character" -> Wait for Editor
        if (stepIndex === 1 && selectedCharacter) {
            setTimeout(() => setStepIndex(2), 600); 
        }
        // Step 4: "Click Test Button" -> Wait for Test Modal
        if (stepIndex === 4 && activeModal?.name === 'testPage') {
            setTimeout(() => setStepIndex(5), 500);
        }
        // Step 6: "Close Test Page" -> Wait for Modal Close
        if (stepIndex === 6 && activeModal === null) {
             setTimeout(() => setStepIndex(7), 300);
        }
        // Step 7: "Select 'F'" -> Wait for F
        if (stepIndex === 7 && selectedCharacter?.name === 'F') {
            setTimeout(() => setStepIndex(8), 500);
        }
        // Step 13: "Click Next Arrow" -> Wait for next character 'E'
        if (stepIndex === 13 && selectedCharacter?.name === 'E') {
             setTimeout(() => setStepIndex(14), 500);
        }
    }, [stepIndex, selectedCharacter, activeModal, run, script?.id]);

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
            // Logic only applies to linear tutorial multi-step flow
            if (script?.id === 'tutorial') {
                const isInteractionStep = [1, 4, 6, 7, 13].includes(index);
                if (action === ACTIONS.NEXT) {
                     if (!isInteractionStep) {
                        setStepIndex(index + 1);
                     }
                } else if (action === ACTIONS.PREV) {
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
