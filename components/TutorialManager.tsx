
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Joyride, { CallBackProps, STATUS, Step, EVENTS, ACTIONS, Placement } from 'react-joyride';
import { useProject } from '../contexts/ProjectContext';
import { useGlyphData } from '../contexts/GlyphDataContext';
import { useLayout } from '../contexts/LayoutContext';
import { useTheme } from '../contexts/ThemeContext';
import { useLocale } from '../contexts/LocaleContext';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { usePositioning } from '../contexts/PositioningContext';
import { useKerning } from '../contexts/KerningContext';
import { Tool } from '../types';
import { isGlyphDrawn } from '../utils/glyphUtils';
import TutorialTooltip from './tutorial/TutorialTooltip';
import { useTutorialSteps } from './tutorial/useTutorialSteps';

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
    const { glyphDataMap } = useGlyphData();
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
    
    const linearTutorialSteps = useTutorialSteps(translations, isLargeScreen);
    
    // Calculate total drawn glyphs for JIT logic
    const drawnCount = useMemo(() => {
        let count = 0;
        glyphDataMap.forEach((data) => {
            if (isGlyphDrawn(data)) count++;
        });
        return count;
    }, [glyphDataMap]);

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

    // 3. JIT Hint Logic (RESTORED and CONSOLIDATED)
    useEffect(() => {
        if (!translations || script?.id === 'tutorial' || activeModal || run) return;
        if (workspace === 'drawing') {
            // Hint 1: Select Character
            if (currentView === 'grid' && !selectedCharacter) {
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
                       }
                    }, 500);
                    setTimeout(() => clearInterval(checkExist), 5000);
                    return () => clearInterval(checkExist);
                }
            }
            // Hint 2: Start Drawing
            if (selectedCharacter) {
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
                    }, 800);
                    return () => clearTimeout(timer);
                }
            }
            // Hint 3: First Composite Glyph (Exclude Linked Glyphs)
            if (selectedCharacter) {
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
            if (selectedCharacter && selectedCharacter.link && selectedCharacter.link.length > 0) {
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
            // Hint 5: Relink Action (After Unlinking)
            if (selectedCharacter && selectedCharacter.sourceLink) {
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
            // Hint 6: Positioned Glyph Intro (Multi-step)
            if (selectedCharacter && !selectedCharacter.link && selectedCharacter.position && selectedCharacter.position.length > 0) {
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
                     }, 1200);
                     return () => clearTimeout(timer);
                }
            }
            // Hint 7: Kerned Glyph Intro (Multi-step)
            if (selectedCharacter && !selectedCharacter.link && selectedCharacter.kern && selectedCharacter.kern.length > 0) {
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
                     }, 1200);
                     return () => clearTimeout(timer);
                 }
            }

            // Hint: Mobile Back
            if (!isLargeScreen && selectedCharacter && drawnCount === 1) {
                const storageKey = 'hint_mobile_back_seen';
                if (!localStorage.getItem(storageKey)) {
                    // Slight delay to ensure UI settles
                    const timer = setTimeout(() => {
                        setActiveSteps([{
                            target: '[data-tour="header-back"]',
                            content: (
                                <div>
                                    <h3 className="font-bold text-lg mb-2 text-indigo-600 dark:text-indigo-400">{translations.hintMobileBackTitle}</h3>
                                    <p dangerouslySetInnerHTML={{__html: translations.hintMobileBackContent}}></p>
                                </div>
                            ),
                            placement: 'bottom',
                            disableBeacon: true,
                            spotlightClicks: true,
                            hideFooter: true,
                            data: { isTutorial: false, storageKey: storageKey, translations }
                        }]);
                        setStepIndex(0);
                        setRun(true);
                    }, 1000);
                    return () => clearTimeout(timer);
                }
            }
        }

        // Hint: Test Font
        if (!selectedCharacter && drawnCount > 0 && workspace === 'drawing') {
            const storageKey = 'hint_test_seen';
            if (!localStorage.getItem(storageKey)) {
                 const timer = setTimeout(() => {
                    setActiveSteps([{
                        target: '[data-tour="header-test"]',
                        content: (
                            <div>
                                <h3 className="font-bold text-lg mb-2 text-indigo-600 dark:text-indigo-400">{translations.hintTestTitle}</h3>
                                <p dangerouslySetInnerHTML={{__html: translations.hintTestContent}}></p>
                            </div>
                        ),
                        placement: 'bottom',
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
        
        // Hint: Export Font
        if (!selectedCharacter && drawnCount >= 3 && workspace === 'drawing') {
            const storageKey = 'hint_export_seen';
            if (!localStorage.getItem(storageKey)) {
                 const timer = setTimeout(() => {
                    setActiveSteps([{
                        target: '[data-tour="header-export"]',
                        content: (
                            <div>
                                <h3 className="font-bold text-lg mb-2 text-indigo-600 dark:text-indigo-400">{translations.hintExportTitle}</h3>
                                <p dangerouslySetInnerHTML={{__html: translations.hintExportContent}}></p>
                            </div>
                        ),
                        placement: 'bottom',
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
        
        // Hint 8: Kerning Workspace Intro (Multi-step)
        if (workspace === 'kerning') {
            const storageKey = 'tutorial_kerning_tour_completed';
            if (!localStorage.getItem(storageKey)) {
                // Wait for UI to mount
                const timer = setTimeout(() => {
                    const steps = [
                        {
                            target: '[data-tour="nav-kerning"]',
                            content: (
                                <div>
                                    <h3 className="font-bold text-lg mb-2 text-indigo-600 dark:text-indigo-400">{translations.hintWhatIsKerningTitle}</h3>
                                    <p dangerouslySetInnerHTML={{__html: translations.hintWhatIsKerningContent}}></p>
                                </div>
                            ),
                            placement: 'bottom' as Placement,
                            disableBeacon: true,
                            data: { isTutorial: false, translations }
                        },
                        {
                            target: '[data-tour="kerning-tabs"]',
                            content: (
                                <div>
                                    <h3 className="font-bold text-lg mb-2 text-indigo-600 dark:text-indigo-400">{translations.hintKerningViewsTitle}</h3>
                                    <p dangerouslySetInnerHTML={{__html: translations.hintKerningViewsContent}}></p>
                                </div>
                            ),
                            placement: 'bottom' as Placement,
                            data: { isTutorial: false, translations }
                        },
                        {
                            target: '[data-tour="auto-kern-btn"]',
                            content: (
                                <div>
                                    <h3 className="font-bold text-lg mb-2 text-indigo-600 dark:text-indigo-400">{translations.hintKerningToolsTitle}</h3>
                                    <p dangerouslySetInnerHTML={{__html: translations.hintKerningToolsContent}}></p>
                                </div>
                            ),
                            placement: 'bottom' as Placement,
                            data: { isTutorial: false, storageKey: storageKey, translations }
                        }
                    ];
                    setActiveSteps(steps);
                    setStepIndex(0);
                    setRun(true);
                }, 1000);
                return () => clearTimeout(timer);
            }
        }
        
    }, [script?.id, workspace, currentView, selectedCharacter, activeModal, translations, run, drawnCount, isLargeScreen]);

    // Combined Polling Effect for Positioning & Kerning JIT Hints
    useEffect(() => {
        if (activeModal || run || !translations || script?.id === 'tutorial') return;

        const checkHints = setInterval(() => {
            if (workspace === 'positioning') {
                // Hint A: Workspace Intro & Views
                // Trigger: Just entering the workspace
                if (!localStorage.getItem('hint_pos_intro_seen')) {
                    const toggle = document.querySelector('[data-tour="positioning-view-toggle"]');
                    if (toggle) {
                        clearInterval(checkHints);
                        setActiveSteps([{
                            target: '[data-tour="positioning-view-toggle"]',
                            content: (
                                <div>
                                    <h3 className="font-bold text-lg mb-2 text-indigo-600 dark:text-indigo-400">Positioning Workspace</h3>
                                    <p>This workspace aligns marks to base characters. The view toggles allow organization by <strong>Rule</strong> (groups), <strong>Base</strong>, or <strong>Mark</strong>.</p>
                                </div>
                            ),
                            placement: 'bottom',
                            disableBeacon: true,
                            data: { isTutorial: false, storageKey: 'hint_pos_intro_seen', translations }
                        }]);
                        setStepIndex(0);
                        setRun(true);
                        return;
                    }
                }

                // Hint B: Auto-Positioning (Rules View)
                // Trigger: When a Rule Block appears
                if (!localStorage.getItem('hint_pos_rules_seen')) {
                    const ruleBlock = document.querySelector('[data-tour^="start-positioning-rule-"]');
                    if (ruleBlock) {
                        clearInterval(checkHints);
                        setActiveSteps([{
                            target: ruleBlock as HTMLElement,
                            content: (
                                <div>
                                    <h3 className="font-bold text-lg mb-2 text-indigo-600 dark:text-indigo-400">Auto-Positioning</h3>
                                    <p>The app has already calculated default positions for these pairs based on standard typography rules. The <strong>Start Positioning</strong> button opens the detailed grid to review them.</p>
                                </div>
                            ),
                            placement: isLargeScreen ? 'right' : 'bottom',
                            disableBeacon: true,
                            data: { isTutorial: false, storageKey: 'hint_pos_rules_seen', translations }
                        }]);
                        setStepIndex(0);
                        setRun(true);
                        return;
                    }
                }

                // Hint C: Grid & Confirmation
                // Trigger: When Grid cards appear
                if (!localStorage.getItem('hint_pos_grid_seen')) {
                    const acceptBtn = document.querySelector('[data-tour^="accept-pos-"]');
                    const comboCard = document.querySelector('[data-tour^="combo-card-"]');
                    
                    if (acceptBtn && comboCard) {
                        clearInterval(checkHints);
                        setActiveSteps([{
                            target: acceptBtn as HTMLElement,
                            content: (
                                <div>
                                    <h3 className="font-bold text-lg mb-2 text-indigo-600 dark:text-indigo-400">Accepting Suggestions</h3>
                                    <p>Cards with dashed borders are <strong>Auto-Positioned suggestions</strong>. The <strong>Checkmark</strong> button confirms the position and saves it to the font file.</p>
                                </div>
                            ),
                            placement: 'left', 
                            disableBeacon: true,
                            spotlightClicks: true,
                            data: { isTutorial: false, storageKey: 'hint_pos_grid_seen', translations }
                        }]);
                        setStepIndex(0);
                        setRun(true);
                        return;
                    }
                }
            } else if (workspace === 'kerning') {
                // Hint: Accept Suggestions (Kerning)
                if (!localStorage.getItem('hint_kerning_accept_seen')) {
                    const btn = document.querySelector('[data-tour="accept-batch-btn"]');
                    if (btn) {
                        clearInterval(checkHints);
                        setActiveSteps([{
                            target: btn as HTMLElement,
                            content: (
                                <div>
                                    <h3 className="font-bold text-lg mb-2 text-indigo-600 dark:text-indigo-400">{translations.hintKerningAcceptTitle}</h3>
                                    <p dangerouslySetInnerHTML={{__html: translations.hintKerningAcceptContent}}></p>
                                </div>
                            ),
                            placement: 'bottom',
                            disableBeacon: true,
                            spotlightClicks: true,
                            data: { isTutorial: false, storageKey: 'hint_kerning_accept_seen', translations }
                        }]);
                        setStepIndex(0);
                        setRun(true);
                        return;
                    }
                }
            }

        }, 1000); 

        return () => clearInterval(checkHints);
    }, [workspace, activeModal, run, translations, isLargeScreen]);

    // NEW: Polling for Related Pairs Strip (can appear in Drawing or Positioning workspace contexts)
    useEffect(() => {
        if (activeModal || run || !translations) return;
        
        // Hint D: Related Pairs (Smart Class)
        if (!localStorage.getItem('hint_related_pairs_seen')) {
            const checkStrip = setInterval(() => {
                const strip = document.querySelector('[data-tour="related-pairs-strip"]');
                if (strip) {
                    clearInterval(checkStrip);
                    setActiveSteps([
                        {
                            target: '[data-tour="related-pairs-strip"]',
                            content: (
                                <div>
                                    <h3 className="font-bold text-lg mb-2 text-indigo-600 dark:text-indigo-400">{translations.hintRelatedPairsTitle}</h3>
                                    <p>{translations.hintRelatedPairsContent}</p>
                                </div>
                            ),
                            placement: 'top',
                            disableBeacon: true,
                            spotlightClicks: true,
                            data: { isTutorial: false, translations }
                        },
                        {
                            target: '[data-tour="strip-link-toggle"]',
                            content: (
                                <div>
                                    <h3 className="font-bold text-lg mb-2 text-indigo-600 dark:text-indigo-400">{translations.hintOverrideTitle}</h3>
                                    <p>{translations.hintOverrideContent}</p>
                                </div>
                            ),
                            placement: 'top',
                            disableBeacon: true,
                            data: { isTutorial: false, storageKey: 'hint_related_pairs_seen', translations }
                        }
                    ]);
                    setStepIndex(0);
                    setRun(true);
                }
            }, 1000);
            return () => clearInterval(checkStrip);
        }
    }, [activeModal, run, translations, isLargeScreen]);

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
             if (currentStepTarget === '[data-tour="positioning-view-toggle"]' && workspace !== 'positioning') {
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
                tooltipComponent={TutorialTooltip}
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
