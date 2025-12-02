
import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { useLocale } from '../contexts/LocaleContext';
import { useGlyphData } from '../contexts/GlyphDataContext';
import { useCharacter } from '../contexts/CharacterContext';
import { useSettings } from '../contexts/SettingsContext';
import Modal from './Modal';
import { ProjectData, GlyphData, Character, ScriptConfig } from '../types';
import { SpinnerIcon, CheckCircleIcon, ImportIcon } from '../constants';
import { isGlyphDrawn } from '../utils/glyphUtils';
import GlyphTile from './GlyphTile';
import * as dbService from '../services/dbService';

interface ImportGlyphsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (glyphsToImport: [number, GlyphData][]) => void;
  allScripts: ScriptConfig[];
}

interface ComparisonItem {
  unicode: number;
  name: string;
  sourceGlyph: GlyphData;
  targetIsDrawn: boolean;
  targetCharExists: boolean;
}

const ImportGlyphsModal: React.FC<ImportGlyphsModalProps> = ({ isOpen, onClose, onImport, allScripts }) => {
  const { t } = useLocale();
  const { glyphDataMap: currentGlyphData } = useGlyphData();
  const { allCharsByName: currentCharsByName } = useCharacter();
  const { settings } = useSettings();

  const [step, setStep] = useState<'selectFile' | 'selectGlyphs' | 'confirm'>('selectFile');
  const [sourceProject, setSourceProject] = useState<ProjectData | null>(null);
  const [selectedUnicodes, setSelectedUnicodes] = useState<Set<number>>(new Set());
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [recentProjects, setRecentProjects] = useState<ProjectData[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);

  const resetState = () => {
    setStep('selectFile');
    setSourceProject(null);
    setSelectedUnicodes(new Set());
    setFileError(null);
    setRecentProjects([]);
    if(fileInputRef.current) fileInputRef.current.value = "";
  }

  const handleClose = () => {
    resetState();
    onClose();
  };
  
  useEffect(() => {
      if (isOpen && step === 'selectFile') {
          setIsLoadingProjects(true);
          dbService.getRecentProjects(100) // Get up to 100 recent projects
              .then(projects => {
                  setRecentProjects(projects);
                  setIsLoadingProjects(false);
              })
              .catch(err => {
                  console.error("Failed to load recent projects:", err);
                  setIsLoadingProjects(false);
              });
      }
  }, [isOpen, step]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const projectData: ProjectData = JSON.parse(e.target?.result as string);
        if (projectData && Array.isArray(projectData.glyphs) && Array.isArray(projectData.characterSets)) {
          setSourceProject(projectData);
          setStep('selectGlyphs');
        } else {
          throw new Error('Invalid project file format.');
        }
      } catch (err) {
        setFileError(t('errorReadingProjectFile'));
      }
    };
    reader.readAsText(file);
  };
  
  const handleProjectSelect = async (projectId: number | undefined) => {
      if (projectId === undefined) return;
      setFileError(null);
      try {
          const projectData = await dbService.getProject(projectId);
          if (projectData && Array.isArray(projectData.glyphs) && Array.isArray(projectData.characterSets)) {
              setSourceProject(projectData);
              setStep('selectGlyphs');
          } else {
              throw new Error('Invalid project data format in database.');
          }
      } catch (err) {
          setFileError(t('errorReadingProjectFile'));
      }
  };

  const comparisons = useMemo((): ComparisonItem[] => {
    if (!sourceProject || !sourceProject.characterSets) return [];
    
    const sourceGlyphDataByUnicode = new Map(sourceProject.glyphs);
    const sourceCharsByName = new Map<string, Character>();
    sourceProject.characterSets.forEach(set => {
        set.characters.forEach(char => {
            if (char.name && char.unicode !== undefined) {
                sourceCharsByName.set(char.name, char);
            }
        });
    });

    const drawnSourceGlyphs: ComparisonItem[] = [];

    for (const [sourceName, sourceChar] of sourceCharsByName.entries()) {
        const sourceGlyph = sourceGlyphDataByUnicode.get(sourceChar.unicode!);
        
        if (sourceGlyph && isGlyphDrawn(sourceGlyph)) {
            const targetChar = currentCharsByName.get(sourceName);
            
            if (targetChar && targetChar.unicode !== undefined) {
                drawnSourceGlyphs.push({
                    unicode: targetChar.unicode, // IMPORTANT: Use target project's unicode
                    name: sourceName,
                    sourceGlyph: sourceGlyph,
                    targetIsDrawn: isGlyphDrawn(currentGlyphData.get(targetChar.unicode) as GlyphData | undefined),
                    targetCharExists: true,
                });
            }
        }
    }

    return drawnSourceGlyphs.sort((a,b) => a.unicode - b.unicode);
  }, [sourceProject, currentGlyphData, currentCharsByName]);


  const toggleSelection = (unicode: number) => {
    setSelectedUnicodes(prev => {
        const newSet = new Set(prev);
        if (newSet.has(unicode)) {
            newSet.delete(unicode);
        } else {
            newSet.add(unicode);
        }
        return newSet;
    });
  };
  
  const handleSelectAll = () => setSelectedUnicodes(new Set(comparisons.map(c => c.unicode)));
  const handleDeselectAll = () => setSelectedUnicodes(new Set());

  const { newCount, overwriteCount } = useMemo(() => {
    return comparisons.reduce((acc, comp) => {
      if (selectedUnicodes.has(comp.unicode)) {
        if (comp.targetIsDrawn) {
          acc.overwriteCount++;
        } else {
          acc.newCount++;
        }
      }
      return acc;
    }, { newCount: 0, overwriteCount: 0 });
  }, [selectedUnicodes, comparisons]);

  const handleConfirmImport = () => {
    const glyphsToImport = comparisons
      .filter(c => selectedUnicodes.has(c.unicode))
      .map(c => [c.unicode, c.sourceGlyph] as [number, GlyphData]);
    onImport(glyphsToImport);
    handleClose();
  };

  const renderFileSelectStep = () => (
    <div className="py-4">
      <h3 className="text-lg font-semibold mb-4">{t('recentProjects')}</h3>
      {isLoadingProjects ? (
        <div className="flex justify-center items-center h-48"><SpinnerIcon /></div>
      ) : recentProjects.length > 0 ? (
        <div className="max-h-64 overflow-y-auto space-y-2 pr-2 mb-6">
          {recentProjects.map(p => {
            const scriptForProject = allScripts.find(s => s.id === p.scriptId) || (p.scriptId?.startsWith('custom_blocks_') ? { nameKey: 'customBlockFont' } : null);
            const scriptName = scriptForProject ? t(scriptForProject.nameKey) : 'Unknown Script';
            return (
              <button key={p.projectId} onClick={() => handleProjectSelect(p.projectId)} className="w-full flex items-center gap-4 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 border border-gray-200 dark:border-gray-600 text-left transition-colors">
                <div className="flex-grow">
                  <p className="font-bold text-gray-900 dark:text-white">{p.settings.fontName}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{scriptName}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{new Date(p.savedAt!).toLocaleString()}</p>
                </div>
              </button>
            )
          })}
        </div>
      ) : (
        <p className="text-center text-gray-500 py-8">No saved projects found.</p>
      )}
  
      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-300 dark:border-gray-600" /></div>
        <div className="relative flex justify-center"><span className="px-2 bg-white dark:bg-gray-800 text-sm text-gray-500">OR</span></div>
      </div>
      
      <div className="text-center">
        <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".json" />
        <p className="text-gray-600 dark:text-gray-400 mb-4">{t('importGlyphsDescription')}</p>
        <button 
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-3 px-6 py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition-colors shadow-md"
        >
          <ImportIcon />
          <span>{t('selectProjectFile')}</span>
        </button>
        {fileError && <p className="mt-4 text-red-500">{fileError}</p>}
      </div>
    </div>
  );

  const renderGlyphSelectStep = () => (
    <div className="flex flex-col h-[70vh]">
        <div className="flex-shrink-0 p-2 border-b dark:border-gray-700 flex items-center justify-between">
            <h3 className="font-semibold">{t('sourceProject')}: <span className="font-mono text-indigo-600 dark:text-indigo-400">{sourceProject?.settings.fontName}</span></h3>
            <div className="flex gap-2">
                <button onClick={handleSelectAll} className="px-3 py-1 text-xs bg-indigo-600 text-white font-semibold rounded-md">{t('selectAllToImport')}</button>
                <button onClick={handleDeselectAll} className="px-3 py-1 text-xs bg-gray-500 text-white font-semibold rounded-md">{t('deselectAllToImport')}</button>
            </div>
        </div>
        <div className="flex-grow overflow-y-auto">
            {comparisons.length === 0 ? (
                <p className="text-center py-10 text-gray-500">{t('noDrawnGlyphsInFile')}</p>
            ) : (
                <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-white dark:bg-gray-800">
                        <tr className="border-b dark:border-gray-700">
                            <th className="p-2 w-12"></th>
                            <th className="p-2 text-left">{t('glyphName')}</th>
                            <th className="p-2 text-center">{t('sourceProject')}</th>
                            <th className="p-2 w-8"></th>
                            <th className="p-2 text-center">{t('targetProject')}</th>
                            <th className="p-2 text-left">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {comparisons.map(comp => (
                            <tr key={comp.unicode} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                <td className="p-2 text-center"><input type="checkbox" checked={selectedUnicodes.has(comp.unicode)} onChange={() => toggleSelection(comp.unicode)} className="h-4 w-4 rounded accent-indigo-500" /></td>
                                <td className="p-2 font-semibold">{comp.name}</td>
                                <td className="p-2"><div className="flex justify-center"><GlyphTile character={{name: comp.name, unicode: comp.unicode}} glyphData={comp.sourceGlyph} strokeThickness={sourceProject?.settings.strokeThickness || 15} /></div></td>
                                <td className="p-2 text-center text-xl text-gray-400">→</td>
                                <td className="p-2"><div className="flex justify-center"><GlyphTile character={{name: comp.name, unicode: comp.unicode}} glyphData={currentGlyphData.get(comp.unicode)} strokeThickness={settings?.strokeThickness || 15} /></div></td>
                                <td className="p-2">
                                    {comp.targetIsDrawn 
                                        ? <span className="text-yellow-600 dark:text-yellow-400 font-semibold">⚠️ {t('willBeOverwritten')}</span>
                                        : <span className="text-green-600 dark:text-green-400">{t('willBeFilled')}</span>
                                    }
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    </div>
  );

  const renderConfirmStep = () => (
    <div className="py-4">
      <h3 className="text-lg font-semibold mb-4">{t('confirmImportSummary', { newCount, overwriteCount })}</h3>
      <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400">
          {newCount > 0 && <li>{newCount} glyph(s) will be newly drawn.</li>}
          {overwriteCount > 0 && <li><span className="font-bold text-yellow-600 dark:text-yellow-400">{overwriteCount} glyph(s) will have their existing drawings overwritten.</span></li>}
      </ul>
      <p className="mt-6 font-bold text-red-600 dark:text-red-400">{t('actionCannotBeUndone')}</p>
    </div>
  );

  const getTitle = () => {
    if (step === 'confirm') return t('confirmImportTitle');
    return t('importGlyphsModalTitle');
  };

  const getFooter = () => {
    if (step === 'selectFile') {
        return <button type="button" onClick={handleClose} className="px-4 py-2 bg-gray-500 text-white font-semibold rounded-lg">{t('cancel')}</button>;
    }
    if (step === 'selectGlyphs') {
      return <>
        <button type="button" onClick={() => setStep('selectFile')} className="px-4 py-2 bg-gray-500 text-white font-semibold rounded-lg">{t('back')}</button>
        <button type="button" onClick={() => setStep('confirm')} disabled={selectedUnicodes.size === 0} className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg disabled:bg-indigo-400">{t('importAction')} ({selectedUnicodes.size})</button>
      </>;
    }
    if (step === 'confirm') {
      return <>
        <button type="button" onClick={() => setStep('selectGlyphs')} className="px-4 py-2 bg-gray-500 text-white font-semibold rounded-lg">{t('back')}</button>
        <button type="button" onClick={handleConfirmImport} className="px-4 py-2 bg-green-600 text-white font-semibold rounded-lg">{t('confirm')}</button>
      </>;
    }
    return null;
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={getTitle()} size="xl" footer={getFooter()}>
      {step === 'selectFile' && renderFileSelectStep()}
      {step === 'selectGlyphs' && renderGlyphSelectStep()}
      {step === 'confirm' && renderConfirmStep()}
    </Modal>
  );
};

export default ImportGlyphsModal;
