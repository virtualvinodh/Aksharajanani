
import React, { useMemo } from 'react';
import { Step, Placement } from 'react-joyride';

export const useTutorialSteps = (
    translations: Record<string, string> | null,
    isLargeScreen: boolean
): Step[] => {
    return useMemo(() => {
        if (!translations) return [];
        
        const richText = (key: string) => React.createElement('div', { dangerouslySetInnerHTML: { __html: translations[key] } });
        
        const steps: Step[] = [
            // 0. Welcome
            {
                target: 'body',
                content: React.createElement('div', null,
                    React.createElement('h3', { className: "font-bold text-lg mb-2 text-indigo-600 dark:text-indigo-400" }, translations.welcomeTitle),
                    React.createElement('p', null, translations.welcomeContent)
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
            { target: '[data-tour="header-test"]', content: translations.clickTest, spotlightClicks: true, hideFooter: true, data: { isTutorial: true, advanceOn: 'test-modal-open', translations } },
            { target: '[data-tour="test-page-input"]', content: translations.testPageInput, placement: 'bottom' as Placement, disableBeacon: true, data: { isTutorial: true, translations } },
            { target: '[data-tour="test-page-close"]', content: translations.closeTestPage, spotlightClicks: true, hideFooter: true, data: { isTutorial: true, advanceOn: 'test-modal-close', translations } },

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
                data: { isTutorial: true, translations } 
            },
            { target: '[data-tour="positioning-editor-page"]', content: translations.positioningEditor, data: { isTutorial: true, translations } },
            
            { target: '[data-tour="nav-kerning"]', content: translations.kerningNav, spotlightClicks: true, hideFooter: true, data: { isTutorial: true, advanceOn: 'workspace-kerning', translations } },
            { target: '[data-tour="kerning-tabs"]', content: richText('kerningIntroAndViews'), placement: 'bottom' as Placement, data: { isTutorial: true, translations } },
            
            { 
                target: '[data-tour="pair-card-Te"]', 
                content: translations.kerningManualEdit, 
                spotlightClicks: true, 
                hideFooter: true, 
                data: { isTutorial: true, translations } 
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
};
