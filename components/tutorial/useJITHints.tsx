
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { CallBackProps, STATUS, EVENTS, ACTIONS, Step, Placement } from 'react-joyride';
import { useProject } from '../../contexts/ProjectContext';
import { useGlyphData } from '../../contexts/GlyphDataContext';
import { useLayout } from '../../contexts/LayoutContext';
import { isGlyphDrawn } from '../../utils/glyphUtils';

export const useJITHints = (
    translations: Record<string, string> | null,
    isLargeScreen: boolean
) => {
    const { script } = useProject();
    const { glyphDataMap, version } = useGlyphData();
    const { selectedCharacter, activeModal, workspace, currentView } = useLayout();
    
    const [run, setRun] = useState(false);
    const [steps, setSteps] = useState<Step[]>([]);
    const [stepIndex, setStepIndex] = useState(0);

    const isTutorialActive = script?.id === 'tutorial';

    // Calculate total drawn glyphs for JIT logic
    const drawnCount = useMemo(() => {
        let count = 0;
        glyphDataMap.forEach((data) => {
            if (isGlyphDrawn(data)) count++;
        });
        return count;
    }, [glyphDataMap, version]);

    // Triggers
    useEffect(() => {
        if (!translations || isTutorialActive || activeModal || run) return;
        
        // Global Header Hints: Test & Export
        const isHeaderVisible = !['creator', 'settings', 'comparison', 'rules'].includes(currentView);
        const canShowHeaderHints = isHeaderVisible && (isLargeScreen || !selectedCharacter);

        if (canShowHeaderHints) {
            const exportUnseen = drawnCount >= 3 && !localStorage.getItem('hint_export_seen');
            const testUnseen = drawnCount > 0 && !localStorage.getItem('hint_test_seen');
            
            if (exportUnseen) {
                 const exportBtn = document.querySelector('[data-tour="header-export"]');
                 if (exportBtn) {
                     const timer = setTimeout(() => {
                        setSteps([{
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
                            data: { isTutorial: false, storageKey: 'hint_export_seen', translations }
                        }]);
                        setStepIndex(0);
                        setRun(true);
                    }, 1000);
                    return () => clearTimeout(timer);
                 }
            } else if (testUnseen) {
                 const testBtn = document.querySelector('[data-tour="header-test"]');
                 if (testBtn) {
                     const timer = setTimeout(() => {
                        setSteps([{
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
                            data: { isTutorial: false, storageKey: 'hint_test_seen', translations }
                        }]);
                        setStepIndex(0);
                        setRun(true);
                    }, 1000);
                    return () => clearTimeout(timer);
                 }
            }
        }

        if (workspace === 'drawing') {
            // Combined Grid Hints Logic: Prioritize "Review Required" over "Select Character"
            if (currentView === 'grid' && !selectedCharacter) {
                const selectStorageKey = 'hint_grid_select_seen';
                const dottedStorageKey = 'hint_grid_dotted_seen';
                
                const hasSeenSelect = !!localStorage.getItem(selectStorageKey);
                const hasSeenDotted = !!localStorage.getItem(dottedStorageKey);

                if (!hasSeenSelect || !hasSeenDotted) {
                    const checkGridHints = setInterval(() => {
                        // 1. Priority Check: Review Required (Dotted)
                        // We check this FIRST so it takes precedence over the generic select hint
                        if (!hasSeenDotted) {
                             const dashedCard = document.querySelector('.tutorial-glyph-item [data-status="review-required"]');
                             if (dashedCard) {
                                 clearInterval(checkGridHints);
                                 setSteps([{
                                     target: dashedCard as HTMLElement,
                                     content: (
                                         <div>
                                             <h3 className="font-bold text-lg mb-2 text-indigo-600 dark:text-indigo-400">{translations.hintGridDottedTitle}</h3>
                                             <p dangerouslySetInnerHTML={{__html: translations.hintGridDottedContent}}></p>
                                         </div>
                                     ),
                                     placement: 'bottom',
                                     disableBeacon: true,
                                     spotlightClicks: false,
                                     data: { isTutorial: false, storageKey: dottedStorageKey, translations }
                                 }]);
                                 setStepIndex(0);
                                 setRun(true);
                                 return; // Exit so we don't trigger the other hint
                             }
                        }

                        // 2. Fallback Check: Generic Select
                        // Only runs if we didn't trigger the review hint above
                        if (!hasSeenSelect) {
                            if (document.querySelector('.tutorial-glyph-item')) {
                                clearInterval(checkGridHints);
                                setSteps([{
                                    target: '.tutorial-glyph-item',
                                    content: translations.hintGridSelect || "Select a character card to start drawing your font.",
                                    disableBeacon: true,
                                    placement: 'bottom' as Placement,
                                    spotlightClicks: true,
                                    data: { isTutorial: false, storageKey: selectStorageKey, translations }
                                }]);
                                setStepIndex(0);
                                setRun(true);
                            }
                        }
                    }, 1000); // Check every 1s
                    
                    const safety = setTimeout(() => clearInterval(checkGridHints), 10000);
                    return () => { clearInterval(checkGridHints); clearTimeout(safety); };
                }
            }
            
            // Hints inside Editor
            if (selectedCharacter) {
                const currentGlyph = selectedCharacter.unicode ? glyphDataMap.get(selectedCharacter.unicode) : undefined;
                const isCurrentDrawn = isGlyphDrawn(currentGlyph);

                // Hint 2: Start Drawing (Only for the very first character)
                if (drawnCount === 0) {
                    const drawStorageKey = 'hint_editor_draw_seen';
                    if (!localStorage.getItem(drawStorageKey)) {
                        const timer = setTimeout(() => {
                            setSteps([{
                               target: '[data-tour="drawing-canvas"]',
                               content: translations.hintEditorDraw || "Start drawing here.",
                               disableBeacon: true,
                               placement: 'top' as Placement,
                               spotlightClicks: true,
                               data: { isTutorial: false, storageKey: drawStorageKey, translations }
                            }]);
                            setStepIndex(0);
                            setRun(true);
                        }, 800);
                        return () => clearTimeout(timer);
                    }
                }

                // New Hint: Toolbar Tour (Triggers on entering 2nd character, before drawing)
                if (drawnCount === 1 && !isCurrentDrawn) {
                    const toolbarStorageKey = 'hint_toolbar_seen';
                    if (!localStorage.getItem(toolbarStorageKey)) {
                         const placement = isLargeScreen ? 'right' as Placement : 'bottom' as Placement;
                         const timer = setTimeout(() => {
                             setSteps([
                                {
                                    target: '[data-tour="main-toolbar"]',
                                    content: (
                                        <div>
                                            <h3 className="font-bold text-lg mb-2 text-indigo-600 dark:text-indigo-400">Toolbar</h3>
                                            <p dangerouslySetInnerHTML={{__html: translations.toolbarIntro}}></p>
                                        </div>
                                    ),
                                    placement,
                                    disableBeacon: true,
                                    data: { isTutorial: false, translations }
                                },
                                {
                                    target: '[data-tour="tool-select"]',
                                    content: <div dangerouslySetInnerHTML={{ __html: translations.toolSelect }} />,
                                    placement,
                                    data: { isTutorial: false, translations }
                                },
                                {
                                    target: '[data-tour="tool-pan"]',
                                    content: <div dangerouslySetInnerHTML={{ __html: translations.toolPan }} />,
                                    placement,
                                    data: { isTutorial: false, translations }
                                },
                                {
                                    target: '[data-tour="toolbar-pen"]',
                                    content: translations.toolbarPenContent,
                                    placement,
                                    data: { isTutorial: false, translations }
                                },
                                {
                                    target: '[data-tour="tool-calligraphy"]',
                                    content: <div dangerouslySetInnerHTML={{ __html: translations.toolCalligraphy }} />,
                                    placement,
                                    data: { isTutorial: false, translations }
                                },
                                {
                                    target: '[data-tour="tool-eraser"]',
                                    content: <div dangerouslySetInnerHTML={{ __html: translations.toolEraser }} />,
                                    placement,
                                    data: { isTutorial: false, translations }
                                },
                                {
                                    target: '[data-tour="tool-slice"]',
                                    content: <div dangerouslySetInnerHTML={{ __html: translations.toolSlice }} />,
                                    placement,
                                    data: { isTutorial: false, translations }
                                },
                                {
                                    target: '[data-tour="action-undo"]',
                                    content: <div dangerouslySetInnerHTML={{ __html: translations.actionUndo }} />,
                                    placement,
                                    data: { isTutorial: false, translations }
                                },
                                {
                                    target: '[data-tour="action-redo"]',
                                    content: <div dangerouslySetInnerHTML={{ __html: translations.actionRedo }} />,
                                    placement,
                                    data: { isTutorial: false, translations }
                                },
                                {
                                    target: '[data-tour="action-cut"]',
                                    content: <div dangerouslySetInnerHTML={{ __html: translations.actionCut }} />,
                                    placement,
                                    data: { isTutorial: false, translations }
                                },
                                {
                                    target: '[data-tour="action-copy"]',
                                    content: <div dangerouslySetInnerHTML={{ __html: translations.actionCopy }} />,
                                    placement,
                                    data: { isTutorial: false, translations }
                                },
                                {
                                    target: '[data-tour="action-paste"]',
                                    content: <div dangerouslySetInnerHTML={{ __html: translations.actionPaste }} />,
                                    placement,
                                    data: { isTutorial: false, translations }
                                },
                                {
                                    target: '[data-tour="action-group"]',
                                    content: <div dangerouslySetInnerHTML={{ __html: translations.actionGroup }} />,
                                    placement,
                                    data: { isTutorial: false, translations }
                                },
                                {
                                    target: '[data-tour="action-ungroup"]',
                                    content: <div dangerouslySetInnerHTML={{ __html: translations.actionUngroup }} />,
                                    placement,
                                    data: { isTutorial: false, storageKey: toolbarStorageKey, translations }
                                }
                             ]);
                             setStepIndex(0);
                             setRun(true);
                         }, 500);
                         return () => clearTimeout(timer);
                    }
                }

                // New Hint: Metrics (Side Bearings) - Delayed until 2nd char is drawn
                if (drawnCount >= 2 && isCurrentDrawn) {
                    const metricsStorageKey = 'hint_metrics_seen';
                    if (!localStorage.getItem(metricsStorageKey)) {
                        const timer = setTimeout(() => {
                            setSteps([{
                                target: '[data-tour="drawing-canvas"]',
                                content: (
                                    <div>
                                        <h3 className="font-bold text-lg mb-2 text-indigo-600 dark:text-indigo-400">{translations.hintMetricsTitle}</h3>
                                        <p dangerouslySetInnerHTML={{__html: translations.hintMetricsContent}}></p>
                                    </div>
                                ),
                                placement: 'top',
                                disableBeacon: true,
                                spotlightClicks: true,
                                data: { isTutorial: false, storageKey: metricsStorageKey, translations }
                            }]);
                            setStepIndex(0);
                            setRun(true);
                        }, 2000); 
                        return () => clearTimeout(timer);
                    }
                }
            }

            // Hint 3: First Composite Glyph
            if (selectedCharacter) {
                 const isStaticComposite = (selectedCharacter.composite && selectedCharacter.composite.length > 0) && (!selectedCharacter.link);
                 if (isStaticComposite) {
                     const storageKey = 'hint_composite_seen';
                     if (!localStorage.getItem(storageKey)) {
                         const timer = setTimeout(() => {
                             setSteps([{
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
            // Hint 4: First Linked Glyph Intro
            if (selectedCharacter && selectedCharacter.link && selectedCharacter.link.length > 0) {
                const storageKey = 'hint_linked_intro_seen';
                if (!localStorage.getItem(storageKey)) {
                     const timer = setTimeout(() => {
                         setSteps([
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
            // Hint 5: Relink Action
            if (selectedCharacter && selectedCharacter.sourceLink) {
                const storageKey = 'hint_relink_action_seen';
                if (!localStorage.getItem(storageKey)) {
                     const timer = setTimeout(() => {
                         setSteps([{
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
            // Hint 6: Positioned Glyph Intro
            if (selectedCharacter && !selectedCharacter.link && selectedCharacter.position && selectedCharacter.position.length > 0) {
                 const storageKey = 'hint_positioned_seen';
                 if (!localStorage.getItem(storageKey)) {
                     const timer = setTimeout(() => {
                         setSteps([
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
            // Hint 7: Kerned Glyph Intro
            if (selectedCharacter && !selectedCharacter.link && selectedCharacter.kern && selectedCharacter.kern.length > 0) {
                 const storageKey = 'hint_kerned_seen';
                 if (!localStorage.getItem(storageKey)) {
                     const timer = setTimeout(() => {
                         setSteps([
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
                    const timer = setTimeout(() => {
                        setSteps([{
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
        
        // Hint 8: Kerning Workspace Intro
        if (workspace === 'kerning') {
            const storageKey = 'tutorial_kerning_tour_completed';
            if (!localStorage.getItem(storageKey)) {
                const timer = setTimeout(() => {
                    setSteps([
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
                    ]);
                    setStepIndex(0);
                    setRun(true);
                }, 1000);
                return () => clearTimeout(timer);
            }
        }
        
    }, [isTutorialActive, workspace, currentView, selectedCharacter, activeModal, translations, run, drawnCount, isLargeScreen]);

    // Combined Polling Effect for Positioning & Kerning JIT Hints
    useEffect(() => {
        if (activeModal || run || !translations || isTutorialActive) return;

        const checkHints = setInterval(() => {
            if (workspace === 'positioning') {
                if (!localStorage.getItem('hint_pos_intro_seen')) {
                    const toggle = document.querySelector('[data-tour="positioning-view-toggle"]');
                    if (toggle) {
                        clearInterval(checkHints);
                        setSteps([{
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
                if (!localStorage.getItem('hint_pos_rules_seen')) {
                    const ruleBlock = document.querySelector('[data-tour^="start-positioning-rule-"]');
                    if (ruleBlock) {
                        clearInterval(checkHints);
                        setSteps([{
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
                if (!localStorage.getItem('hint_pos_grid_seen')) {
                    const acceptBtn = document.querySelector('[data-tour^="accept-pos-"]');
                    const comboCard = document.querySelector('[data-tour^="combo-card-"]');
                    if (acceptBtn && comboCard) {
                        clearInterval(checkHints);
                        setSteps([{
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
                if (!localStorage.getItem('hint_kerning_accept_seen')) {
                    const btn = document.querySelector('[data-tour="accept-batch-btn"]');
                    if (btn) {
                        clearInterval(checkHints);
                        setSteps([{
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
    }, [workspace, activeModal, run, translations, isLargeScreen, isTutorialActive]);

    useEffect(() => {
        if (activeModal || run || !translations) return;
        if (!localStorage.getItem('hint_related_pairs_seen')) {
            const checkStrip = setInterval(() => {
                const strip = document.querySelector('[data-tour="related-pairs-strip"]');
                if (strip) {
                    clearInterval(checkStrip);
                    setSteps([
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

    // Cleanup Logic
    useEffect(() => {
        if (run && steps.length > 0 && !steps[0].data?.isTutorial) {
             const currentStepTarget = steps[0].target as string;
             if (currentStepTarget === '.tutorial-glyph-item' && selectedCharacter) {
                 setRun(false);
                 setSteps([]);
             }
             if (currentStepTarget === '[data-tour="drawing-canvas"]' && !selectedCharacter) {
                 setRun(false);
                 setSteps([]);
             }
             if (currentStepTarget === '[data-tour="nav-kerning"]' && workspace !== 'kerning') {
                 setRun(false);
                 setSteps([]);
             }
             if (currentStepTarget === '[data-tour="positioning-view-toggle"]' && workspace !== 'positioning') {
                 setRun(false);
                 setSteps([]);
             }
        }
    }, [run, steps, selectedCharacter, workspace]);

    const handleCallback = useCallback((data: CallBackProps) => {
        if (isTutorialActive) return;
        const { status, type, action, index } = data;
        
        if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
            setRun(false);
            setSteps([]);
        } else if (type === EVENTS.STEP_AFTER) {
            if (action === ACTIONS.NEXT) {
                 setStepIndex(index + 1);
            }
        }
    }, [isTutorialActive]);

    return { run, steps, stepIndex, handleCallback };
};
