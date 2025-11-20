
import React, { useState, useRef } from 'react';
import { useLocale } from '../contexts/LocaleContext';
import { useLayout } from '../contexts/LayoutContext';
import { BackIcon, CheckCircleIcon } from '../constants';
import { ScriptConfig, CharacterDefinition, ScriptsFile } from '../types';
import Footer from './Footer';

interface CustomScriptLoaderProps {
    onBack: () => void;
    onSelectScript: (script: ScriptConfig) => void;
}

type FileState = {
    scripts: File | null;
    characters: File | null;
    positioning: File | null;
    rules: File | null;
};

const CustomScriptLoader: React.FC<CustomScriptLoaderProps> = ({ onBack, onSelectScript }) => {
    const { t } = useLocale();
    const { showNotification } = useLayout();
    const [files, setFiles] = useState<FileState>({ scripts: null, characters: null, positioning: null, rules: null });

    const handleFileChange = (type: keyof FileState) => (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFiles(prev => ({ ...prev, [type]: e.target.files![0] }));
        }
    };

    const handleStartProject = async () => {
        if (!files.scripts || !files.characters || !files.positioning || !files.rules) {
            showNotification(t('errorAllFilesRequired'), 'error');
            return;
        }

        try {
            const readFile = (file: File): Promise<any> => new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        resolve(JSON.parse(e.target?.result as string));
                    } catch (err) {
                        reject(new Error(t('errorParsingFile', { fileName: file.name })));
                    }
                };
                reader.onerror = () => reject(new Error(t('errorReadingFile', { fileName: file.name })));
                reader.readAsText(file);
            });
            
            const [scriptsContent, charactersContent, positioningContent, rulesContent] = await Promise.all([
                readFile(files.scripts),
                readFile(files.characters),
                readFile(files.positioning),
                readFile(files.rules),
            ]);

            const scriptsFile: ScriptsFile = scriptsContent;
            const baseScript = scriptsFile.scripts?.[0];

            if (!baseScript) {
                throw new Error(t('errorNoScriptInFile'));
            }

            const customScriptConfig: ScriptConfig = {
                ...baseScript,
                characterSetData: [
                    ...charactersContent,
                    ...positioningContent,
                ],
                rulesData: rulesContent,
            };

            onSelectScript(customScriptConfig);

        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            showNotification(message, 'error');
        }
    };
    
    const FileInput: React.FC<{ type: keyof FileState; label: string; description: string }> = ({ type, label, description }) => {
        const file = files[type];
        return (
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between">
                    <div>
                        <h4 className="font-bold text-gray-800 dark:text-white">{label}</h4>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
                    </div>
                    <label className={`px-4 py-2 rounded-lg font-semibold cursor-pointer transition-colors ${file ? 'bg-green-600 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>
                        {file ? 'Change File' : 'Upload'}
                        <input type="file" className="hidden" accept=".json" onChange={handleFileChange(type)} />
                    </label>
                </div>
                 {file && (
                    <div className="mt-3 flex items-center gap-2 text-green-600 dark:text-green-400 text-sm font-medium">
                        <CheckCircleIcon className="h-5 w-5"/>
                        <span>{file.name}</span>
                    </div>
                )}
            </div>
        );
    };

    const allFilesUploaded = Object.values(files).every(f => f !== null);

    return (
        <div className="fixed inset-0 bg-white dark:bg-gray-900 z-50 flex flex-col">
            <header className="bg-white/80 dark:bg-gray-800/50 backdrop-blur-sm p-4 flex justify-between items-center shadow-md w-full flex-shrink-0">
                <button onClick={onBack} className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">
                    <BackIcon />
                    <span className="hidden sm:inline">{t('back')}</span>
                </button>
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{t('customScriptLoaderTitle')}</h2>
                <div className="w-24 hidden sm:block"></div>
            </header>
            <main className="flex-grow overflow-y-auto p-6 md:p-10">
                <div className="max-w-3xl mx-auto">
                    <p className="text-center text-gray-600 dark:text-gray-400 mb-8">{t('uploadCustomScriptDescription')}</p>
                    <div className="space-y-4">
                        <FileInput type="scripts" label={t('scriptsJsonFile')} description="Main config, metrics, and defaults." />
                        <FileInput type="characters" label={t('charactersJsonFile')} description="Character sets and glyph definitions." />
                        <FileInput type="positioning" label={t('positioningJsonFile')} description="Spacing, attachment, and kerning rules." />
                        <FileInput type="rules" label={t('rulesJsonFile')} description="OpenType substitution (GSUB) features." />
                    </div>
                    <div className="mt-8 flex justify-center">
                        <button 
                            onClick={handleStartProject}
                            disabled={!allFilesUploaded}
                            className="px-8 py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition-colors disabled:bg-indigo-400 disabled:cursor-not-allowed shadow-lg"
                        >
                            {t('startProject')}
                        </button>
                    </div>
                </div>
            </main>
            <Footer />
        </div>
    );
};

export default CustomScriptLoader;
