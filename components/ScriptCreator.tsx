


import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useLocale } from '../../contexts/LocaleContext';
import { BackIcon } from '../../constants';
import { ScriptConfig, CharacterSet, Character, FontMetrics, ScriptDefaults, PositioningRules, MarkAttachmentRules, RecommendedKerning, CharacterDefinition, GuideFont, TestPageConfig, AttachmentClass, GlyphData } from '../../types';
import Footer from './Footer';
import { useLayout } from '../../contexts/LayoutContext';
import GeneralPane from './scriptcreator/GeneralPane';
import CharactersPane from './scriptcreator/CharactersPane';
import PositioningPane from './scriptcreator/PositioningPane';
import RulesPane from './scriptcreator/RulesPane';

interface ScriptCreatorProps {
    availableScripts: ScriptConfig[];
    onBack: () => void;
    onSelectScript: (script: ScriptConfig) => void;
}

const DEFAULT_METRICS: FontMetrics = {
    unitsPerEm: 1000, ascender: 800, descender: -200, defaultAdvanceWidth: 600,
    topLineY: 250, baseLineY: 500, styleName: "Regular", spaceAdvanceWidth: 400,
    defaultLSB: 30, defaultRSB: 30
};

const DEFAULT_DEFAULTS: ScriptDefaults = {
    fontName: "NewFont", strokeThickness: 15, contrast: 1.0, pathSimplification: 0.5,
    showGridOutlines: false, isAutosaveEnabled: true, editorMode: 'simple',
    isPrefillEnabled: true, showHiddenGlyphs: false
};

const DEFAULT_GUIDE_FONT: GuideFont = { fontName: '', fontUrl: '', stylisticSet: '' };

const DEFAULT_TEST_PAGE: TestPageConfig = {
    fontSize: { default: 48 },
    lineHeight: { default: 1.5 }
};

const ScriptCreator: React.FC<ScriptCreatorProps> = ({ availableScripts, onBack, onSelectScript }) => {
    const { t } = useLocale();
    const { showNotification } = useLayout();
    const [activeTab, setActiveTab] = useState('general');

    // State for each pane
    const [scriptName, setScriptName] = useState('My New Script');
    const [scriptId, setScriptId] = useState('my_new_script');
    const [scriptIdError, setScriptIdError] = useState<string | null>(null);
    const [metrics, setMetrics] = useState<FontMetrics>(DEFAULT_METRICS);
    const [defaults, setDefaults] = useState<ScriptDefaults>(DEFAULT_DEFAULTS);
    const [characterSets, setCharacterSets] = useState<CharacterSet[]>([]);
    const [positioning, setPositioning] = useState({
        positioningRules: [] as PositioningRules[],
        markAttachment: {} as MarkAttachmentRules,
        recommendedKerning: [] as RecommendedKerning[],
        markAttachmentClasses: [] as AttachmentClass[],
        baseAttachmentClasses: [] as AttachmentClass[]
    });
    const [rules, setRules] = useState<any>({ 'dflt': { groups: {}, lookups: {} } });
    const [sampleText, setSampleText] = useState<string>('');
    const [guideFont, setGuideFont] = useState<GuideFont>(DEFAULT_GUIDE_FONT);
    const [testPage, setTestPage] = useState<TestPageConfig>(DEFAULT_TEST_PAGE);
    const [grid, setGrid] = useState<{ characterNameSize: number }>({ characterNameSize: 450 });
    
    const allChars = useMemo(() => characterSets.flatMap(cs => cs.characters), [characterSets]);
    const allCharsByName = useMemo(() => new Map(allChars.map(c => [c.name, c])), [allChars]);
    const scriptTag = useMemo(() => Object.keys(rules).find(key => key !== 'groups' && key !== 'lookups') || 'dflt', [rules]);
    
    const handleScriptNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newName = e.target.value;
        setScriptName(newName);
        setDefaults(d => ({...d, fontName: newName.replace(/\s/g, '') || 'NewFont'}));
        const newId = newName.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') || 'new_script';
        setScriptId(newId);

        if (availableScripts.some(s => s.id === newId)) {
            setScriptIdError(t('errorScriptIdExists'));
        } else if (availableScripts.some(s => t(s.nameKey).toLowerCase() === newName.trim().toLowerCase())) {
            setScriptIdError(t('errorScriptNameExists'));
        } else {
            setScriptIdError(null);
        }
    };

    const resetToDefaults = () => {
        setScriptName('My New Script');
        setScriptId('my_new_script');
        setMetrics(DEFAULT_METRICS);
        setDefaults(DEFAULT_DEFAULTS);
        setCharacterSets([]);
        setPositioning({
            positioningRules: [],
            markAttachment: {},
            recommendedKerning: [],
            markAttachmentClasses: [],
            baseAttachmentClasses: []
        });
        setRules({ 'dflt': { groups: {}, lookups: {} } });
        setSampleText('');
        setGuideFont(DEFAULT_GUIDE_FONT);
        setTestPage(DEFAULT_TEST_PAGE);
        setGrid({ characterNameSize: 450 });
        setScriptIdError(null);
    };

    const handleLoadTemplate = async (selectedScriptId: string) => {
        if (!selectedScriptId) {
            resetToDefaults();
            return;
        }

        const script = availableScripts.find(s => s.id === selectedScriptId);
        if (!script) return;

        try {
            const [charRes, posRes, rulesRes] = await Promise.all([
                fetch(`/data/characters_${script.id}.json`).catch(() => null),
                fetch(`/data/positioning_${script.id}.json`).catch(() => null),
                fetch(`/data/rules_${script.id}.json`).catch(() => null)
            ]);

            const charData: CharacterDefinition[] = charRes && charRes.ok ? await charRes.json() : [];
            const posData: CharacterDefinition[] = posRes && posRes.ok ? await posRes.json() : [];
            const rulesData = rulesRes && rulesRes.ok ? await rulesRes.json() : {};

            const scriptTagForMigration = Object.keys(rulesData).find(key => key !== 'groups' && key !== 'lookups');
            if (scriptTagForMigration && rulesData[scriptTagForMigration]) {
                for (const featureTag in rulesData[scriptTagForMigration]) {
                    const feature = rulesData[scriptTagForMigration][featureTag];
                    if (feature && feature.children === undefined) {
                        const hasInlineRules = ['liga', 'context', 'single', 'multiple', 'dist'].some(key => feature[key] && Object.keys(feature[key]).length > 0);
                        const lookupRefs = Array.isArray(feature.lookups) ? feature.lookups.map((name: string) => ({ type: 'lookup', name })) : [];
                        
                        if (hasInlineRules) {
                            feature.children = [{ type: 'inline' }, ...lookupRefs];
                        } else {
                            feature.children = lookupRefs;
                        }
                        delete feature.lookups;
                    }
                }
            }

            const loadedCharacterSets = charData.filter(d => 'characters' in d) as CharacterSet[];
            
            setPositioning({
                recommendedKerning: (posData.find(d => 'recommendedKerning' in d) as any)?.recommendedKerning || [],
                markAttachment: (posData.find(d => 'markAttachment' in d) as any)?.markAttachment || {},
                positioningRules: (posData.filter(d => 'positioning' in d) as any[])?.flatMap(i => i.positioning) || [],
                markAttachmentClasses: (posData.find(d => 'markAttachmentClass' in d) as any)?.markAttachmentClass || [],
                baseAttachmentClasses: (posData.find(d => 'baseAttachmentClass' in d) as any)?.baseAttachmentClass || []
            });

            const loadedPosGroups = (posData.find(d => 'groups' in d) as any)?.groups || {};
            
            setScriptName(`${t(script.nameKey)} ${t('scriptNameCustomSuffix')}`);
            setScriptId(`${script.id}_custom`);
            setMetrics(script.metrics);
            setDefaults({ ...script.defaults, contrast: 1.0 }); // Default contrast
            setCharacterSets(loadedCharacterSets);
            
            const finalRules = { ...rulesData };
            if (!finalRules.groups) finalRules.groups = {};
            Object.assign(finalRules.groups, loadedPosGroups);
            setRules(finalRules);

            setSampleText(script.sampleText || '');
            setGuideFont(script.guideFont || DEFAULT_GUIDE_FONT);
            setTestPage(script.testPage || DEFAULT_TEST_PAGE);
            setGrid(script.grid || { characterNameSize: 450 });
            setScriptIdError(null);
            showNotification(t('templateLoadedSuccess', { name: t(script.nameKey) }), 'success');

        } catch (error) {
            showNotification(t('errorLoadingTemplate', { name: t(script.nameKey) }), 'error');
            console.error("Failed to load script template:", error);
        }
    };
    
    const handleDownload = (content: any, filename: string) => {
        let finalContent = content;
        if (filename === 'characters.json') {
            finalContent = (content as CharacterSet[]).map(cs => ({
                ...cs,
                characters: cs.characters.map(({ isPuaAssigned, ...c }) => c)
            }));
        }

        const jsonString = JSON.stringify(finalContent, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleStartProject = () => {
        if (scriptIdError) {
            showNotification(scriptIdError, 'error');
            return;
        }
        
        const characterSetData = [ 
            ...characterSets
        ];

        const positioningData = [
            { positioning: positioning.positioningRules }, 
            { markAttachment: positioning.markAttachment }, 
            { recommendedKerning: positioning.recommendedKerning },
            { markAttachmentClass: positioning.markAttachmentClasses },
            { baseAttachmentClass: positioning.baseAttachmentClasses },
            { groups: rules.groups || {} }
        ];

        const scriptConfig: ScriptConfig = {
            id: scriptId, nameKey: scriptName, charactersPath: '', rulesPath: '', metrics, defaults,
            sampleText: sampleText,
            support: 'full',
            grid: grid,
            guideFont: guideFont,
            testPage: testPage,
            characterSetData: [...characterSetData, ...positioningData],
            rulesData: rules
        };
        onSelectScript(scriptConfig);
    };

    const TabButton: React.FC<{ tabId: string, label: string }> = ({ tabId, label }) => (
        <button onClick={() => setActiveTab(tabId)} className={`whitespace-nowrap py-4 px-3 sm:px-4 border-b-2 font-medium text-sm transition-colors ${activeTab === tabId ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:border-gray-500'}`}>
            {label}
        </button>
    );

    const renderActivePane = () => {
        switch (activeTab) {
            case 'general': return <GeneralPane 
                metrics={metrics} setMetrics={setMetrics} 
                defaults={defaults} setDefaults={setDefaults} 
                scriptName={scriptName} handleScriptNameChange={handleScriptNameChange} 
                scriptId={scriptId} scriptIdError={scriptIdError} 
                availableScripts={availableScripts} onLoadTemplate={handleLoadTemplate} 
                sampleText={sampleText} setSampleText={setSampleText}
                guideFont={guideFont} setGuideFont={setGuideFont}
                testPage={testPage} setTestPage={setTestPage}
                grid={grid} setGrid={setGrid}
                />;
            case 'characters': return <CharactersPane sets={characterSets} setSets={setCharacterSets} allChars={allChars} />;
            case 'positioning': return <PositioningPane 
                kerning={positioning.recommendedKerning} setKerning={(v) => setPositioning(p => ({ ...p, recommendedKerning: typeof v === 'function' ? v(p.recommendedKerning) : v }))}
                attachment={positioning.markAttachment} setAttachment={(v) => setPositioning(p => ({ ...p, markAttachment: typeof v === 'function' ? v(p.markAttachment) : v }))}
                positioningRules={positioning.positioningRules} setPositioningRules={(v) => setPositioning(p => ({ ...p, positioningRules: typeof v === 'function' ? v(p.positioningRules) : v }))}
                markAttachmentClasses={positioning.markAttachmentClasses} setMarkAttachmentClasses={(v) => setPositioning(p => ({ ...p, markAttachmentClasses: typeof v === 'function' ? v(p.markAttachmentClasses) : v }))}
                baseAttachmentClasses={positioning.baseAttachmentClasses} setBaseAttachmentClasses={(v) => setPositioning(p => ({ ...p, baseAttachmentClasses: typeof v === 'function' ? v(p.baseAttachmentClasses) : v }))}
                groups={rules.groups || {}}
                characterSets={characterSets}
                />;
            case 'rules': return <RulesPane 
                rules={rules} 
                setRules={setRules} 
                allCharsByName={allCharsByName} 
                scriptTag={scriptTag} 
                allCharacterSets={characterSets}
                glyphDataMap={new Map<number, GlyphData>()}
                strokeThickness={defaults.strokeThickness}
                />;
            default: return null;
        }
    };

    return (
        <div className="fixed inset-0 bg-white dark:bg-gray-900 z-50 flex flex-col">
            <header className="bg-white/80 dark:bg-gray-800/50 backdrop-blur-sm p-4 flex justify-between items-center shadow-md w-full flex-shrink-0">
                <button onClick={onBack} className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"><BackIcon /><span className="hidden sm:inline">{t('back')}</span></button>
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{t('createScriptTitle')}</h2>
                <div className="w-24 hidden sm:block"></div>
            </header>
            <main className="flex-grow flex flex-col overflow-hidden">
                <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700">
                    <nav className="-mb-px flex space-x-2 sm:space-x-4 justify-center" aria-label="Tabs">
                        <TabButton tabId="general" label={t('generalAndMetrics')} />
                        <TabButton tabId="characters" label={t('characters')} />
                        <TabButton tabId="positioning" label={t('positioningRules')} />
                        <TabButton tabId="rules" label={t('rulesTabDescription')} />
                    </nav>
                </div>
                <div className="flex-grow overflow-y-auto bg-gray-50 dark:bg-gray-900/50 p-4 sm:p-6">
                    {renderActivePane()}
                </div>
                <div className="flex-shrink-0 p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <h4 className="font-semibold mb-2">{t('downloadJsonFiles')}:</h4>
                        <div className="flex items-center gap-2 flex-wrap">
                            <button onClick={() => handleDownload({ defaultScriptId: scriptId, scripts: [{id: scriptId, nameKey: scriptName, metrics, defaults, rulesPath: 'rules.json', charactersPath: 'characters.json'}]}, 'scripts.json')} className="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-700 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600">{t('download')} scripts.json</button>
                            <button onClick={() => handleDownload(characterSets, 'characters.json')} className="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-700 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600">{t('download')} characters.json</button>
                            <button onClick={() => handleDownload([
                                { groups: rules.groups || {} },
                                { positioning: positioning.positioningRules }, 
                                { markAttachment: positioning.markAttachment }, 
                                { recommendedKerning: positioning.recommendedKerning },
                                { markAttachmentClass: positioning.markAttachmentClasses },
                                { baseAttachmentClass: positioning.baseAttachmentClasses }
                            ], 'positioning.json')} className="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-700 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600">{t('download')} positioning.json</button>
                            <button onClick={() => handleDownload(rules, 'rules.json')} className="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-700 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600">{t('download')} rules.json</button>
                        </div>
                    </div>
                    <button onClick={handleStartProject} disabled={!!scriptIdError} className="px-6 py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition-colors disabled:bg-indigo-400 disabled:cursor-not-allowed shadow-lg">{t('startCreating')}</button>
                </div>
            </main>
            <Footer />
        </div>
    );
};

export default ScriptCreator;
