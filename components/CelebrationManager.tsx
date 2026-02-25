
import React, { useEffect, useState } from 'react';
import { useProgressCalculators } from '../hooks/useProgressCalculators';
import { useProject } from '../contexts/ProjectContext';
import { useGlyphData } from '../contexts/GlyphDataContext';
import { useKerning } from '../contexts/KerningContext';
import { usePositioning } from '../contexts/PositioningContext';
import { useRules } from '../contexts/RulesContext';
import { useLayout } from '../contexts/LayoutContext';
import CelebrationOverlay from './CelebrationOverlay';
import PositioningCelebrationOverlay from './PositioningCelebrationOverlay';
import KerningCelebrationOverlay from './KerningCelebrationOverlay';
import Joyride, { STATUS } from 'react-joyride';

const CelebrationManager: React.FC = () => {
    const { characterSets, allCharsByName, positioningRules, recommendedKerning, allCharsByUnicode } = useProject();
    const { glyphDataMap, version: glyphVersion } = useGlyphData();
    const { kerningMap } = useKerning();
    const { markPositioningMap } = usePositioning();
    const { state: rulesState } = useRules();
    const { setWorkspace, checkAndSetFlag } = useLayout();

    // Use specific states to track which overlay to show
    // 'drawing' | 'positioning' | 'kerning'
    const [activeOverlay, setActiveOverlay] = useState<string | null>(null);
    const [runHighlight, setRunHighlight] = useState(false);
    const [hasCelebratedDrawing, setHasCelebratedDrawing] = useState(() => {
        return localStorage.getItem('celebration_drawing_seen_session') === 'true';
    });

    const { drawingProgress, positioningProgress, kerningProgress } = useProgressCalculators({
        characterSets,
        glyphDataMap,
        markPositioningMap,
        recommendedKerning,
        allCharsByName,
        fontRules: rulesState.fontRules,
        kerningMap,
        positioningRules,
        glyphVersion
    });

    const isDrawingComplete = drawingProgress.total > 0 && drawingProgress.completed === drawingProgress.total;
    const isPositioningComplete = positioningProgress.total > 0 && positioningProgress.completed === positioningProgress.total;
    // For kerning, explicitly check if there is a 'total' to avoid 0/0=True false positives
    const isKerningComplete = kerningProgress.total > 0 && kerningProgress.completed === kerningProgress.total;

    // Check script requirements
    const requiresPositioning = positioningRules && positioningRules.length > 0;
    const requiresKerning = recommendedKerning && recommendedKerning.length > 0;

    // Scenario Classification
    const isSimple = !requiresPositioning;
    const isComplex = !!requiresPositioning && !requiresKerning;
    const isFull = !!requiresPositioning && !!requiresKerning;

    useEffect(() => {
        // Trigger 1: Drawing Complete
        if (isDrawingComplete && !hasCelebratedDrawing) {
            const hasCelebratedPermanently = checkAndSetFlag('celebration_drawing_seen');
            if (!hasCelebratedPermanently) {
                setActiveOverlay('drawing');
                localStorage.setItem('celebration_drawing_seen_session', 'true');
                setHasCelebratedDrawing(true);
            }
        }
    }, [isDrawingComplete, checkAndSetFlag]);

    useEffect(() => {
        // Trigger 2: Positioning Complete
        if (requiresPositioning && isPositioningComplete) {
            const hasCelebrated = checkAndSetFlag('celebration_positioning_seen');
            if (!hasCelebrated) {
                setActiveOverlay('positioning');
            }
        }
    }, [isPositioningComplete, requiresPositioning, checkAndSetFlag]);

    useEffect(() => {
        // Trigger 3: Kerning Complete
        if (requiresKerning && isKerningComplete) {
            const hasCelebrated = checkAndSetFlag('celebration_kerning_seen');
            if (!hasCelebrated) {
                setActiveOverlay('kerning');
            }
        }
    }, [isKerningComplete, requiresKerning, checkAndSetFlag]);

    const handleClose = () => {
        setActiveOverlay(null);
    };

    const handleProceed = (next: string) => {
        setActiveOverlay(null);
        if (next === 'final') {
            // Trigger Highlight Tour
            setTimeout(() => setRunHighlight(true), 500);
        } else if (next === 'positioning') {
            setWorkspace('positioning');
        } else if (next === 'kerning') {
            setWorkspace('kerning');
        }
    };

    // --- RENDERERS ---

    if (activeOverlay === 'drawing') {
        if (isSimple) {
            // Scenario A: Drawing -> Final
            return (
                <CelebrationOverlay
                    glyphDataMap={glyphDataMap}
                    nextStep="final"
                    customTitle="Congratulations! Font Ready!"
                    customMessage="You've drawn every character. Your font is ready to use! **Want professional polish? You can fine-tune the spacing between specific letters.**"
                    primaryActionLabel="Finish & Export"
                    secondaryActionLabel="Fine-tune Spacing"
                    onProceed={() => handleProceed('final')}
                    onClose={() => handleProceed('kerning')}
                />
            );
        } else {
            // Scenario B & C: Drawing -> Positioning
            return (
                <CelebrationOverlay
                    glyphDataMap={glyphDataMap}
                    nextStep="positioning"
                    onProceed={() => handleProceed('positioning')}
                    onClose={handleClose}
                />
            );
        }
    }

    if (activeOverlay === 'positioning') {
        if (isComplex) {
            // Scenario B: Positioning -> Final (Kerning optional but suggested)
            return (
                <PositioningCelebrationOverlay
                    glyphDataMap={glyphDataMap}
                    markPositioningMap={markPositioningMap}
                    isFinalMilestone={true}
                    onProceed={() => handleProceed('final')}
                    onClose={() => handleProceed('kerning')}
                />
            );
        } else {
             // Scenario C: Positioning -> Kerning
             return (
                <PositioningCelebrationOverlay
                    glyphDataMap={glyphDataMap}
                    markPositioningMap={markPositioningMap}
                    isFinalMilestone={false}
                    onProceed={() => handleProceed('kerning')}
                    onClose={handleClose}
                />
            );
        }
    }
    
    if (activeOverlay === 'kerning') {
        // Scenario C: Kerning -> Final
        return (
            <KerningCelebrationOverlay
                glyphDataMap={glyphDataMap}
                kerningMap={kerningMap}
                allCharsByUnicode={allCharsByUnicode}
                onProceed={() => handleProceed('final')}
                onClose={() => { handleClose(); setRunHighlight(true); }}
            />
        );
    }
    
    // Highlight Tour Steps
    // Add conditional Kerning step if it was optional (Scenarios A & B)
    const baseSteps = [
        {
            target: '[data-tour="header-test"]',
            content: "Test your font immediately in the browser.",
            disableBeacon: true,
            placement: 'bottom' as const,
        },
        {
            target: '[data-tour="header-creator"]',
            content: "Use the Creator Studio to make social media cards with your new font!",
            placement: 'bottom' as const,
        },
        {
            target: '[data-tour="header-export"]',
            content: "Finally, export your .otf file to use it everywhere.",
            placement: 'bottom' as const,
        }
    ];

    // Append optional kerning pointer if not mandatory script
    const tourSteps = (isSimple || isComplex) 
        ? [
            ...baseSteps,
            {
                target: '[data-tour="nav-kerning"]',
                content: "Pro Tip: Use the Kerning tab to fine-tune spacing between specific letter pairs for a polished look.",
                placement: 'bottom' as const,
            }
          ]
        : baseSteps;

    return (
        <Joyride
            steps={tourSteps}
            run={runHighlight}
            continuous
            showProgress
            showSkipButton
            styles={{ options: { zIndex: 10000, primaryColor: '#4f46e5' } }}
            callback={(data) => {
                const { status } = data;
                if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
                    setRunHighlight(false);
                }
            }}
        />
    );
};

export default CelebrationManager;
