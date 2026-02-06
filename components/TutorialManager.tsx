
import React, { useState, useEffect } from 'react';
import Joyride, { CallBackProps, STATUS, Step, EVENTS, ACTIONS } from 'react-joyride';
import { useProject } from '../contexts/ProjectContext';
import { useLayout } from '../contexts/LayoutContext';
import { useTheme } from '../contexts/ThemeContext';

const TutorialManager: React.FC = () => {
    const { script } = useProject();
    const { selectedCharacter, workspace } = useLayout();
    const { theme } = useTheme();
    
    const [run, setRun] = useState(false);
    const [stepIndex, setStepIndex] = useState(0);

    // Detect if we are in the tutorial script
    useEffect(() => {
        if (script?.id === 'tutorial') {
            // Only start if we are at the beginning and in the main view
            if (!selectedCharacter && stepIndex === 0) {
                setRun(true);
            }
        } else {
            setRun(false);
            setStepIndex(0);
        }
    }, [script?.id]);

    // Handle view transitions (Grid -> Editor)
    useEffect(() => {
        if (!run) return;

        // Step 2 is "Click the character". 
        // If the user clicks it, selectedCharacter becomes set. We auto-advance.
        if (stepIndex === 2 && selectedCharacter) {
            // Determine if we successfully entered the editor
            setTimeout(() => {
                setStepIndex(3);
            }, 500); // Small delay for modal animation
        }

        // If user closes editor mid-tutorial, maybe pause or go back? 
        // For simplicity, if they close editor on step > 2, we might want to finish or pause.
        if (stepIndex > 2 && !selectedCharacter) {
             // User closed editor prematurely?
             // Optional: Handle this case
        }

    }, [selectedCharacter, stepIndex, run]);

    const steps: Step[] = [
        {
            target: 'body',
            content: (
                <div>
                    <h3 className="font-bold text-lg mb-2">Welcome to Aksharajanani!</h3>
                    <p>This interactive tutorial will guide you through creating your first font character.</p>
                </div>
            ),
            placement: 'center',
            disableBeacon: true,
        },
        {
            target: '[data-tour="header-title"]',
            content: 'This is your current Project/Script name. We are currently in the "Tutorial" script.',
        },
        {
            target: '[data-tour="grid-item-0"]',
            content: 'This is a character card. Click it to open the Drawing Editor.',
            spotlightClicks: true,
            disableBeacon: true,
            hideFooter: true, // Hide "Next" button, force user to click the element
        },
        {
            target: '[data-tour="drawing-canvas"]',
            content: 'This is your Drawing Canvas. You can draw paths here to define the shape of your character.',
            placement: 'right',
        },
        {
            target: '[data-tour="toolbar-pen"]',
            content: 'This is the Pen tool. Use it to draw vector shapes.',
            placement: 'right',
        },
        {
            target: '[data-tour="editor-metrics"]',
            content: 'Adjust the Left and Right spacing (Side Bearings) here to ensure your character sits correctly next to others.',
        },
        {
            target: '[data-tour="editor-save"]',
            content: 'When you are finished drawing, click Save to return to the grid.',
             // We don't force click here, just point it out
        },
        {
            target: '[data-tour="header-export"]',
            content: 'Finally, once you have drawn your characters, click here to export your OpenType (.otf) font file!',
        }
    ];

    const handleCallback = (data: CallBackProps) => {
        const { status, type, action, index } = data;
        
        if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
            setRun(false);
            setStepIndex(0);
        } else if (type === EVENTS.STEP_AFTER || type === EVENTS.TARGET_NOT_FOUND) {
            // Update state to advance the tour
            const nextStepIndex = index + (action === ACTIONS.PREV ? -1 : 1);
            
            // Don't advance index manually if we are waiting for user interaction on step 2
            if (index === 2 && action === ACTIONS.NEXT && !selectedCharacter) {
                return; 
            }
            
            setStepIndex(nextStepIndex);
        }
    };

    const joyrideStyles = {
        options: {
            arrowColor: theme === 'dark' ? '#1f2937' : '#fff',
            backgroundColor: theme === 'dark' ? '#1f2937' : '#fff',
            overlayColor: 'rgba(0, 0, 0, 0.6)',
            primaryColor: '#4f46e5',
            textColor: theme === 'dark' ? '#f3f4f6' : '#333',
            width: 400,
            zIndex: 10000,
        }
    };

    return (
        <Joyride
            steps={steps}
            run={run}
            stepIndex={stepIndex}
            continuous
            showProgress
            showSkipButton
            callback={handleCallback}
            styles={joyrideStyles}
            locale={{
                last: 'Finish',
                skip: 'Skip Tutorial',
            }}
        />
    );
};

export default TutorialManager;
