
import React, { useState, useEffect } from 'react';
import { ScriptConfig, ScriptsFile, ProjectData } from '../types';
import { useLocale } from '../contexts/LocaleContext';
import ScriptSelection from './ScriptSelection';
import App from '../App';
import AboutPage from './AboutPage';
import HelpPage from './HelpPage';
import { initializePyodide } from '../services/pythonFontService';
import { useProject } from '../contexts/ProjectContext';
import { useGlyphData } from '../contexts/GlyphDataContext';
import { useKerning } from '../contexts/KerningContext';
import { useSettings } from '../contexts/SettingsContext';
import { useClipboard } from '../contexts/ClipboardContext';
import { usePositioning } from '../contexts/PositioningContext';
import { useRules } from '../contexts/RulesContext';
import { useLayout } from '../contexts/LayoutContext';
import Notification from './Notification';

const AppContainer: React.FC = () => {
    const [scriptsFile, setScriptsFile] = useState<ScriptsFile | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    const { t } = useLocale();
    const { openModal, closeModal, setActiveTab, setWorkspace, setCurrentView, closeCharacterModal, activeModal, notification, closeNotification } = useLayout();
    const { script, dispatch: characterDispatch } = useProject();
    const { dispatch: glyphDataDispatch } = useGlyphData();
    const { dispatch: kerningDispatch } = useKerning();
    const { dispatch: settingsDispatch } = useSettings();
    const { dispatch: clipboardDispatch } = useClipboard();
    const { dispatch: positioningDispatch } = usePositioning();
    const { dispatch: rulesDispatch } = useRules();

    const [projectDataToRestore, setProjectDataToRestore] = useState<ProjectData | null>(null);


    useEffect(() => {
        initializePyodide();
    }, []);

    useEffect(() => {
        const LOGO_FONT_STYLE_ID = 'logo-font-face-style';
        const FONT_NAME = 'Purnavarman_1';
        const FONT_URL = 'https://cdn.jsdelivr.net/gh/virtualvinodh/aksharamukha-fonts/Purnawarman_1.ttf';

        if (document.getElementById(LOGO_FONT_STYLE_ID)) return;

        const styleElement = document.createElement('style');
        styleElement.id = LOGO_FONT_STYLE_ID;
        styleElement.innerHTML = `@font-face { font-family: "${FONT_NAME}"; src: url('${FONT_URL}') format('truetype'); font-display: swap; }`;
        document.head.appendChild(styleElement);
    }, []);

    useEffect(() => {
        const fetchScripts = async () => {
            try {
                const response = await fetch('/scripts.json');
                if (!response.ok) throw new Error('Could not load scripts.json configuration.');
                const data: ScriptsFile = await response.json();
                setScriptsFile(data);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'An unknown error occurred');
            } finally {
                setIsLoading(false);
            }
        };
        fetchScripts();
    }, []);

    const handleSelectScript = (selectedScript: ScriptConfig, projectData?: ProjectData) => {
        if (projectData) {
            setProjectDataToRestore(projectData);
        }
        characterDispatch({ type: 'SET_SCRIPT', payload: selectedScript });
    };
    
    const handleBackToSelection = () => {
        closeModal();
        characterDispatch({ type: 'RESET' });
        glyphDataDispatch({ type: 'RESET' });
        kerningDispatch({ type: 'RESET' });
        settingsDispatch({ type: 'RESET' });
        clipboardDispatch({ type: 'RESET' });
        positioningDispatch({ type: 'RESET' });
        rulesDispatch({ type: 'RESET' });

        // Reset layout states to default
        setActiveTab(0);
        setWorkspace('drawing');
        setCurrentView('grid');
        closeCharacterModal();

        setProjectDataToRestore(null);
    };
    
    if (isLoading) {
        return <div className="h-screen bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 flex items-center justify-center p-4"><h1 className="text-2xl font-semibold animate-pulse">{t('loadingScript')}...</h1></div>;
    }
    
    if (error) {
        return <div className="h-screen bg-white dark:bg-gray-900 text-red-500 dark:text-red-400 flex flex-col items-center justify-center p-4"><h1 className="text-2xl font-bold mb-4">Application Error</h1><p className="text-center bg-gray-100 dark:bg-gray-800 p-4 rounded-md">{error}</p></div>;
    }
    
    if (!scriptsFile) {
        return <div className="h-screen bg-white dark:bg-gray-900 text-red-500 dark:text-red-400 flex items-center justify-center p-4"><h1 className="text-2xl font-semibold">Could not load script configuration.</h1></div>;
    }
    
    return (
        <>
            {activeModal?.name === 'about' && <AboutPage onClose={closeModal} />}
            {activeModal?.name === 'help' && <HelpPage onClose={closeModal} scripts={scriptsFile.scripts} />}
            
            {!script ? (
                 <ScriptSelection 
                    scripts={scriptsFile.scripts} 
                    onSelectScript={handleSelectScript} 
                    onShowAbout={() => openModal('about')}
                    onShowHelp={() => openModal('help')}
                />
            ) : (
                <App 
                    allScripts={scriptsFile.scripts}
                    onBackToSelection={handleBackToSelection} 
                    onShowAbout={() => openModal('about')}
                    onShowHelp={() => openModal('help')}
                    onShowTestCases={() => openModal('testCases')}
                    projectDataToRestore={projectDataToRestore}
                />
            )}
            
            {notification && (
                <Notification
                    key={notification.id}
                    message={notification.message}
                    type={notification.type}
                    onClose={closeNotification}
                    duration={notification.duration}
                    onUndo={notification.onUndo}
                />
            )}
        </>
    );
};

export default AppContainer;
