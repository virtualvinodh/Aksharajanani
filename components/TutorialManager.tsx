
import React, { useState, useEffect, useCallback } from 'react';
import Joyride from 'react-joyride';
import { useProject } from '../contexts/ProjectContext';
import { useLayout } from '../contexts/LayoutContext';
import { useTheme } from '../contexts/ThemeContext';
import { useLocale } from '../contexts/LocaleContext';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { Tool } from '../types';
import TutorialTooltip from './tutorial/TutorialTooltip';
import { useLinearTutorial } from './tutorial/useLinearTutorial';
import { useJITHints } from './tutorial/useJITHints';

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
    const { script } = useProject();
    const { activeModal, workspace, currentView, selectedCharacter } = useLayout();
    const { theme } = useTheme();
    const { locale } = useLocale();
    
    const [translations, setTranslations] = useState<Record<string, string> | null>(null);
    const [currentTool, setCurrentTool] = useState<Tool>('pen');
    
    const isLargeScreen = useMediaQuery('(min-width: 1024px)');
    const [scrollOffset, setScrollOffset] = useState(150);
    
    // Load Engines
    const linearEngine = useLinearTutorial(translations, isLargeScreen);
    const jitEngine = useJITHints(translations, isLargeScreen);

    // Arbitration: Linear tutorial takes precedence if running
    const activeEngine = (script?.id === 'tutorial' && linearEngine.steps.length > 0) 
        ? linearEngine 
        : jitEngine;

    // Scroll Offset Logic (UI specific)
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
    }, [workspace, currentView, selectedCharacter, activeEngine.stepIndex, updateScrollOffset]);

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
    
    if (!translations || activeEngine.steps.length === 0) return null;

    return (
        <>
            {activeModal && <TutorialStateProvider onToolChange={handleToolChange} />}
            <Joyride
                steps={activeEngine.steps}
                run={activeEngine.run}
                stepIndex={activeEngine.stepIndex}
                continuous
                showProgress={activeEngine.steps.length > 1}
                showSkipButton
                callback={activeEngine.handleCallback}
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
