
import React, { useState, useEffect, useMemo, useRef } from 'react';
import Joyride, { CallBackProps, STATUS, Step, EVENTS, ACTIONS, TooltipRenderProps } from 'react-joyride';
import { useProject } from '../contexts/ProjectContext';
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
    
    const handleDontShowAgain = () => {
        localStorage.setItem('tutorial_dismissed', 'true');
        skipProps.onClick(); 
    };
  
    return (
      <div {...tooltipProps} className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-5 max-w-sm border border-gray-200 dark:border-gray-700 flex flex-col gap-4 relative z-50">
         <div className="text-gray-700 dark:text-gray-200 text-sm leading-relaxed">
           {step.content}
         </div>
         
         <div className="flex flex-col gap-3 mt-2">
              <div className="flex justify-between items-center">
                   <div className="flex items-center">
                      {!isLastStep && (
                           <button {...skipProps} className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 text-xs font-bold uppercase tracking-wider transition-colors">
                               Skip
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
                           <button {...primaryProps} className="px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 shadow-md transition-all active:scale-95">
                              {isLastStep ? 'Finish' : 'Next'}
                           </button>
                       )}
                   </div>
              </div>
              
              <div className="border-t border-gray-100 dark:border-gray-700 pt-3 text-center">
                  <button 
                      onClick={handleDontShowAgain}
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
    const { selectedCharacter, activeModal } = useLayout();
    const { theme } = useTheme();
    const { locale } = useLocale();
    
    const [run, setRun] = useState(false);
    const [stepIndex, setStepIndex] = useState(0);
    const [translations, setTranslations] = useState<Record<string, string> | null>(null);

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

    // Initial Start Logic
    useEffect(() => {
        if (script?.id === 'tutorial') {
            const isDismissed = localStorage.getItem('tutorial_dismissed') === 'true';
            // Only start fresh if at index 0
            if (stepIndex === 0 && !isDismissed) {
                setRun(true);
            }
        } else {
            setRun(false);
            setStepIndex(0);
        }
    }, [script?.id]);

    // --- State Machine for Navigation Steps ---
    useEffect(() => {
        if (!run) return;

        // Step 1: "Click the first character" -> Wait for Editor
        // Move to Step 2 (Pen Tool Highlight)
        if (stepIndex === 1 && selectedCharacter) {
            // Short delay to ensure DOM is ready
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
        
        // Step 7: "Click Back to Grid" -> Wait for Editor Close
        if (stepIndex === 7 && !selectedCharacter) {
            setTimeout(() => setStepIndex(8), 500);
        }

        // Step 8: "Click Next Character" -> Wait for Editor
        if (stepIndex === 8 && selectedCharacter) {
            setTimeout(() => setStepIndex(9), 500);
        }
        
        // Step 13: "Click Next Arrow" -> Wait for next character 'E'
        if (stepIndex === 13 && selectedCharacter?.name === 'E') {
             setTimeout(() => setStepIndex(14), 500);
        }

    }, [stepIndex, selectedCharacter, activeModal, run]);

    const steps: Step[] = useMemo(() => {
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
            },
            // 1. Click 'A' (Interaction)
            {
                target: '[data-tour="grid-item-0"]',
                content: translations.clickFirstChar,
                spotlightClicks: true,
                disableBeacon: true,
                hideFooter: true, // User must click element to advance
            },
            // 2. Highlight Pen Tool (Red Dot/Beacon Enabled)
            {
                target: '[data-tour="toolbar-pen"]',
                content: translations.toolbarPenContent,
                placement: 'right',
                disableBeacon: false, // Show beacon first
                spotlightClicks: true, 
            },
            // 3. Draw on Canvas (Red Dot/Beacon Enabled)
            {
                target: '[data-tour="drawing-canvas"]',
                content: translations.drawContent,
                placement: 'right',
                disableBeacon: false, // Show beacon first
                spotlightClicks: true, // Allow user to draw
                disableOverlayClose: true,
            },
            // 4. Click Test (Interaction)
            {
                target: '[data-tour="header-test"]',
                content: translations.clickTest,
                spotlightClicks: true,
                disableBeacon: true,
                hideFooter: true, // User must click element
            },
            // 5. Test Input
            {
                target: '[data-tour="test-page-input"]',
                content: translations.testPageInput,
                placement: 'bottom',
                disableBeacon: true,
                spotlightClicks: true,
            },
            // 6. Close Test (Interaction)
            {
                target: '[data-tour="test-page-close"]',
                content: translations.closeTestPage,
                spotlightClicks: true,
                disableBeacon: true,
                hideFooter: true, // User must click element
            },
            // 7. Go Back to Grid (Interaction)
            {
                target: '[data-tour="header-back"]',
                content: translations.goBackToGrid,
                spotlightClicks: true,
                disableBeacon: true,
                hideFooter: true, // User must click element
            },
            // 8. Click Next Char (Interaction)
            {
                target: '[data-tour="grid-item-1"]', // Target the second item explicitly
                content: translations.clickNextChar,
                spotlightClicks: true,
                disableBeacon: true,
                hideFooter: true, // User must click element
            },
            // 9. Select/Pan
            {
                target: '[data-tour="tool-select"]',
                content: translations.toolSelectPan,
                placement: 'top',
                disableBeacon: true,
            },
            // 10. Eraser
            {
                target: '[data-tour="tool-eraser"]',
                content: translations.toolEraser,
                placement: 'top',
                disableBeacon: true,
            },
            // 11. Undo/Redo
            {
                target: '[data-tour="action-undo"]',
                content: translations.actionUndo,
                placement: 'top',
                disableBeacon: true,
            },
            // 12. Group/Copy
            {
                target: '[data-tour="action-group"]',
                content: translations.actionGroup,
                placement: 'top',
                disableBeacon: true,
            },
            // 13. Click Next Arrow (Interaction)
            {
                target: '[data-tour="header-next"]',
                content: translations.clickNextForComposite,
                spotlightClicks: true,
                disableBeacon: true,
                hideFooter: true, // User must click element
            },
            // 14. Explain Composite
            {
                target: 'body',
                content: translations.compositeExplanation,
                placement: 'center',
                disableBeacon: true,
            },
            // 15. Finish
            {
                target: 'body',
                content: translations.finish,
                placement: 'center',
            }
        ];
    }, [translations]);

    const handleCallback = (data: CallBackProps) => {
        const { status, type, action, index } = data;
        
        if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
            setRun(false);
            setStepIndex(0);
        } else if (type === EVENTS.STEP_AFTER || type === EVENTS.TARGET_NOT_FOUND) {
            // Updated indices requiring user interaction (clicking a specific app button to advance)
            // Steps 2 (Pen) and 3 (Canvas) are NOT here because we want the user to click the "Next" button in the tooltip after they are done.
            const isInteractionStep = [1, 4, 6, 7, 8, 13].includes(index);
            
            if (action === ACTIONS.NEXT) {
                 if (!isInteractionStep) {
                    setStepIndex(index + 1);
                 }
            } else if (action === ACTIONS.PREV) {
                setStepIndex(index - 1);
            }
        }
    };

    if (!translations || steps.length === 0) return null;

    return (
        <Joyride
            steps={steps}
            run={run}
            stepIndex={stepIndex}
            continuous
            showProgress
            showSkipButton
            callback={handleCallback}
            tooltipComponent={CustomTooltip}
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
                    // Make beacon red/prominent as requested
                    inner: '#EF4444', 
                    outer: '#EF4444'
                }
            }}
            locale={{
                last: translations.last,
                skip: translations.skip,
            }}
        />
    );
};

export default TutorialManager;
