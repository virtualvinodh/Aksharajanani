import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Joyride, { CallBackProps, STATUS, Step, EVENTS, ACTIONS, TooltipRenderProps, Placement } from 'react-joyride';
import { useProject } from '../contexts/ProjectContext';
import { useGlyphData } from '../contexts/GlyphDataContext';
import { useLayout } from '../contexts/LayoutContext';
import { useTheme } from '../contexts/ThemeContext';
import { useLocale } from '../contexts/LocaleContext';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { usePositioning } from '../contexts/PositioningContext';
import { Tool } from '../types';
import { isGlyphComplete } from '../utils/glyphUtils';

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
    // FIX: Changed SyntheticEvent to MouseEvent to match what onClick provides and what Joyride expects.
    const performDismiss = (e?: React.MouseEvent<HTMLElement>) => {
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

    const handlePrimaryClick = (e: React.MouseEvent<HTMLElement>) => {
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

// Dummy component to get access to context
const TutorialStateProvider: React.FC<{ onToolChange: (tool: Tool) => void }> = ({ onToolChange }) => {
    // This is a bit of a hack. Joyride doesn't have a direct way to read app state.
    // So we render a tiny component inside the modal that *can* read context, and use it to advance the tour.
    // In a real app, this would be handled by a global state manager like Redux or Zustand.
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
    
    const [run, setRun] = useState(false);
    const [stepIndex, setStepIndex] = useState(0);
    const [translations, setTranslations] = useState<Record<string, string> | null>(null);
    const [activeSteps, setActiveSteps] = useState<Step[]>([]);
    const [currentTool, setCurrentTool] = useState<Tool>('pen');
    
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
            // 2. Split View Intro
            {
                target: '[data-tour="split-view-resizer"]',
                content: richText('splitViewIntro'),
                placement: 'right' as Placement,
                data: { isTutorial: true, translations },
                styles: { spotlight: { borderRadius: '8px' } }
            },
            // 3. Pen Tool
            {
                target: '[data-tour="toolbar-pen"]',
                content: translations.toolbarPenContent,
                placement: (isLargeScreen ? 'right' : 'bottom') as Placement,
                disableBeacon: true, 
                data: { isTutorial: true, translations }
            },
            // 4. Draw 'A'
            {
                target: '[data-tour="drawing-canvas"]',
                content: translations.drawContent,
                placement: 'right' as Placement,
                disableBeacon: true,
                spotlightClicks: true,
                disableOverlayClose: true,
                data: { isTutorial: true, translations }
            },
            // 5. Click Test
            { 
                target: '[data-tour="header-test"]', 
                content: translations.clickTest, 
                spotlightClicks: true, 
                hideFooter: true, 
                data: { isTutorial: true, advanceOn: 'test-modal-open', translations } 
            },
            // 6. Test Page Input
            { 
                target: '[data-tour="test-page-input"]', 
                content: translations.testPageInput, 
                placement: 'bottom' as Placement,
                disableBeacon: true, 
                data: { isTutorial: true, translations } 
            },
            // 7. Close Test Page
            { 
                target: '[data-tour="test-page-close"]', 
                content: translations.closeTestPage, 
                spotlightClicks: true, 
                hideFooter: true, 
                data: { isTutorial: true, advanceOn: 'test-modal-close', translations } 
            },
            // 8. Next for 'a'
            {
                target: '[data-tour="header-next"]',
                content: translations.clickNextForA,
                spotlightClicks: true,
                hideFooter: true,
                data: { isTutorial: true, advanceOn: 'selected-a', translations }
            },
            // 9. Draw 'a'
            {
                target: '[data-tour="drawing-canvas"]',
                content: translations.drawLowerA,
                placement: 'right' as Placement,
                disableBeacon: true,
                spotlightClicks: true,
                disableOverlayClose: true,
                data: { isTutorial: true, translations }
            },
            // 10. Toolbar Intro
            {
                target: '[data-tour="main-toolbar"]',
                content: translations.toolbarIntro,
                placement: (isLargeScreen ? 'right' : 'bottom') as Placement,
                data: { isTutorial: true, translations }
            },
            // 11. Toolbar Actions Intro
            {
                target: '[data-tour="main-toolbar"]',
                content: translations.toolbarActionsIntro,
                placement: (isLargeScreen ? 'right' : 'bottom') as Placement,
                data: { isTutorial: true, translations }
            },
            // 12-23. Toolbar Tour
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

            // 24. Next for 'T'
            {
                target: '[data-tour="header-next"]',
                content: translations.clickNextForT,
                spotlightClicks: true,
                hideFooter: true,
                data: { isTutorial: true, advanceOn: 'selected-T', translations }
            },
            // 25. Select Line Tool (Manual)
            {
                target: '[data-tour="main-toolbar"]',
                content: richText('selectLineTool'),
                spotlightClicks: true,
                placement: (isLargeScreen ? 'right' : 'bottom') as Placement,
                disableBeacon: true,
                data: { isTutorial: true, translations }
            },
            // 26. Draw 'T'
            {
                target: '[data-tour="drawing-canvas"]',
                content: translations.drawT,
                placement: 'right' as Placement,
                disableBeacon: true,
                spotlightClicks: true,
                disableOverlayClose: true,
                data: { isTutorial: true, translations }
            },
            
            // --- NEW RESPONSIVE FLOW FOR 'F' ---
            ...(isLargeScreen ? [{
                // Large Screen: Select 'F' from split view grid
                target: '[data-tour="grid-item-F"]',
                content: translations.selectCharF,
                spotlightClicks: true, 
                hideFooter: true, 
                placement: 'right' as Placement,
                data: { isTutorial: true, advanceOn: 'selected-F', translations }
            }] : [{
                // Small Screen: Open drawer, then select 'F'
                target: '[data-tour="floating-grid-btn"]',
                content: translations.openGrid,
                spotlightClicks: true, 
                hideFooter: true,
                data: { isTutorial: true, advanceOn: 'drawer-open', translations }
            },{
                target: '#mobile-nav-drawer [data-tour="grid-item-F"]',
                content: translations.selectCharF,
                spotlightClicks: true, 
                hideFooter: true, 
                placement: 'right' as Placement,
                data: { isTutorial: true, advanceOn: 'selected-F', translations }
            }]),

            // Draw 'F' (Common step)
            {
                target: '[data-tour="drawing-canvas"]',
                content: translations.drawCharF,
                placement: 'right' as Placement, disableBeacon: true, spotlightClicks: true,
                disableOverlayClose: true, data: { isTutorial: true, translations }
            },
            // Next for 'E'
            {
                target: '[data-tour="header-next"]',
                content: translations.clickNextForComposite,
                spotlightClicks: true, hideFooter: true,
                data: { isTutorial: true, advanceOn: 'selected-E', translations }
            },
            // Composite Explanation
            { target: 'body', content: richText('compositeExplanation'), placement: 'center' as Placement, disableBeacon: true, data: { isTutorial: true, translations } },
            // Draw Composite 'E'
            {
                target: '[data-tour="drawing-canvas"]',
                content: translations.drawComposite,
                placement: 'right' as Placement, disableBeacon: true, spotlightClicks: true,
                disableOverlayClose: true, data: { isTutorial: true, translations }
            },
            // Linked Glyphs section
            { target: '[data-tour="header-next"]', content: translations.clickNextForLowerE, spotlightClicks: true, hideFooter: true, data: { isTutorial: true, advanceOn: 'selected-e', translations } },
            { target: '[data-tour="drawing-canvas"]', content: translations.drawLowerE, placement: 'right' as Placement, disableBeacon: true, spotlightClicks: true, disableOverlayClose: true, data: { isTutorial: true, translations } },
            { target: '[data-tour="header-next"]', content: translations.clickNextForLinked, spotlightClicks: true, hideFooter: true, data: { isTutorial: true, advanceOn: 'selected-combining', translations } },
            { target: 'body', content: richText('linkedExplanation'), placement: 'center' as Placement, disableBeacon: true, data: { isTutorial: true, translations } },
            { target: '[data-tour="linked-source-strip"]', content: translations.linkedStripNav, placement: 'top' as Placement, disableBeacon: true, data: { isTutorial: true, translations } },
            { target: '[data-tour="drawing-canvas"]', content: richText('transformLinked'), placement: 'right' as Placement, disableBeacon: true, spotlightClicks: true, data: { isTutorial: true, translations } },
            { target: '[data-tour="header-prev"]', content: translations.clickPrevForModification, spotlightClicks: true, hideFooter: true, data: { isTutorial: true, advanceOn: 'selected-e', translations } },
            { target: '[data-tour="drawing-canvas"]', content: translations.modifyLowerE, placement: 'right' as Placement, disableBeacon: true, spotlightClicks: true, disableOverlayClose: true, data: { isTutorial: true, translations } },
            { target: '[data-tour="header-next"]', content: translations.clickNextToVerify, spotlightClicks: true, hideFooter: true, data: { isTutorial: true, advanceOn: 'selected-combining', translations } },
            { target: '[data-tour="drawing-canvas"]', content: translations.verifyLink, placement: 'right' as Placement, disableBeacon: true, data: { isTutorial: true, translations } },
            
            // Go Back to Grid
            {
                target: '[data-tour="header-back"]', content: translations.explainBack, spotlightClicks: true, hideFooter: true,
                data: { isTutorial: true, advanceOn: 'back-to-dashboard', translations }
            },
            
            // Final Header Actions
            { target: '[data-tour="header-creator"]', content: translations.explainCreator, placement: 'bottom' as Placement, data: { isTutorial: true, translations } },
            { target: '[data-tour="header-compare"]', content: translations.explainCompare, placement: 'bottom' as Placement, data: { isTutorial: true, translations } },
            { target: '[data-tour="header-settings"]', content: translations.explainSettings, placement: 'bottom' as Placement, data: { isTutorial: true, translations } },
            { target: '[data-tour="header-export"]', content: translations.explainExport, placement: 'bottom' as Placement, data: { isTutorial: true, translations } },

            // --- NEW: Positioning Workspace Section ---
            {
                target: '[data-tour="nav-positioning"]', content: translations.positioningNav, spotlightClicks: true, hideFooter: true,
                data: { isTutorial: true, advanceOn: 'workspace-positioning', translations }
            },
            {
                target: 'body', content: translations.positioningIntro, placement: 'center' as Placement,
                data: { isTutorial: true, translations }
            },
            {
                target: '[data-tour="positioning-view-toggle"]', content: translations.positioningViews, placement: 'bottom' as Placement,
                data: { isTutorial: true, translations }
            },
            {
                target: '[data-tour="accept-pos-Aͤ"]', content: translations.positioningAccept, spotlightClicks: true, hideFooter: true,
                data: { isTutorial: true, advanceOn: 'accepted-A-combining', translations }
            },
            {
                target: '[data-tour="grid-item-Eͤ"]', content: translations.positioningEdit, spotlightClicks: true, hideFooter: true,
                data: { isTutorial: true, advanceOn: 'editing-E-combining', translations }
            },
            {
                target: '[data-tour="positioning-editor-page"]', content: translations.positioningEditor,
                data: { isTutorial: true, translations }
            },
            
            // Final Message
            { target: 'body', content: translations.finish, placement: 'center' as Placement, disableBeacon: true, data: { isTutorial: true, translations } }
        ];

        return steps;
    }, [translations, isLargeScreen]);

    // This is a bit of a hack to get the current tool from the editor modal's internal context
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

    // 3. JIT Hint Logic
    useEffect(() => {
        if (!translations) return;
        if (script?.id === 'tutorial') return;
        
        // Hint 1: Select Character
        if (workspace === 'drawing' && currentView === 'grid' && !selectedCharacter && !activeModal) {
            const storageKey = 'hint_grid_select_seen';
            if (!localStorage.getItem(storageKey) && !sessionStorage.getItem(storageKey)) {
                const checkExist = setInterval(() => {
                   if (document.querySelector('.tutorial-glyph-item')) {
                       clearInterval(checkExist);
                       setActiveSteps([{
                           target: '.tutorial-glyph-item',
                           content: translations.hintGridSelect || "Select a character to start.",
                           disableBeacon: true,
                           placement: 'bottom' as Placement,
                           spotlightClicks: true,
                           data: { isTutorial: false, storageKey: storageKey, translations }
                       }]);
                       setStepIndex(0);
                       setRun(true);
                       sessionStorage.setItem(storageKey, 'true');
                   }
                }, 500);
                setTimeout(() => clearInterval(checkExist), 5000);
                return () => clearInterval(checkExist);
            }
        }
        
        // Hint 2: Start Drawing
        if (workspace === 'drawing' && selectedCharacter && !activeModal) {
            const storageKey = 'hint_editor_draw_seen';
            if (!localStorage.getItem(storageKey) && !sessionStorage.getItem(storageKey)) {
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
                    sessionStorage.setItem(storageKey, 'true');
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
                                target: '[data-tour="drawing-canvas"]',
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
                                target: '[data-tour="drawing-canvas"]',
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
                }, 500);
                return () => clearTimeout(timer);
            }
        }

    }, [script?.id, workspace, currentView, selectedCharacter, activeModal, translations]);

    // Hint: Related Pairs (Smart Class) - Polling approach (unchanged)
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
            }
        }, 1000); 

        return () => clearInterval(checkExist);
    }, [run, activeModal, translations]); 

    // 4. JIT Cleanup Logic
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
            case 'selected-n': if (selectedCharacter?.name === 'n') advance(); break;
            case 'selected-tilde': if (selectedCharacter?.name === '̃') advance(); break;
            case 'selected-macron': if (selectedCharacter?.name === '̄') advance(); break;
            case 'selected-ntilde': if (selectedCharacter?.name === 'ñ') advance(); break;
            case 'back-to-dashboard': if (!activeModal && !selectedCharacter) advance(); break;
            case 'test-modal-open': if (activeModal?.name === 'testPage') advance(); break;
            case 'test-modal-close': if (activeModal === null) advance(); break;
            case 'drawer-open': if (isNavDrawerOpen) advance(); break;
            case 'workspace-positioning': if (workspace === 'positioning') advance(); break;
            case 'accepted-A-combining': {
                const A = allCharsByName.get('A');
                const combining = allCharsByName.get('ͤ');
                if (A?.unicode && combining?.unicode && markPositioningMap.has(`${A.unicode}-${combining.unicode}`)) {
                    advance();
                }
                break;
            }
            case 'editing-E-combining':
                if (document.querySelector('[data-tour="positioning-editor-page"]')) {
                    advance();
                }
                break;
        }
    }, [stepIndex, selectedCharacter, activeModal, run, script?.id, activeSteps, isNavDrawerOpen, currentTool, workspace, allCharsByName, markPositioningMap]);

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
        <>
            {/* This is a hacky way to inject tool state into the manager */}
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
                    // FIX: Replaced deprecated 'beacon' object with 'beaconInner' and 'beaconOuter' for styling.
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