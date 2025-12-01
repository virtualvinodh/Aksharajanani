
import React, { useState } from 'react';
import { AppSettings, ToolRanges, FontMetrics } from '../types';
import { useLocale } from '../contexts/LocaleContext';
import { BackIcon } from '../constants';
import Footer from './Footer';
import GeneralSettings from './settings/GeneralSettings';
import EditorSettings from './settings/EditorSettings';
import MetaDataSettings from './settings/MetaDataSettings';
import TestPageSettings from './settings/TestPageSettings';
import MetricsSettings from './settings/MetricsSettings';
import { useSettings } from '../contexts/SettingsContext';

interface SettingsPageProps {
  onClose: () => void;
  toolRanges: ToolRanges;
}

type ActiveTab = 'general' | 'editor' | 'meta' | 'testPage' | 'metrics';

const TabButton: React.FC<{
    tabId: ActiveTab;
    label: string;
    activeTab: ActiveTab;
    onClick: (tabId: ActiveTab) => void;
}> = React.memo(({ tabId, label, activeTab, onClick }) => (
   <button
      onClick={() => onClick(tabId)}
      className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors
          ${activeTab === tabId
              ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:border-gray-500'}`
      }
  >
      {label}
  </button>
));


const SettingsPage: React.FC<SettingsPageProps> = ({ onClose, toolRanges }) => {
  const { t } = useLocale();
  const { settings, metrics, dispatch } = useSettings();

  const [activeTab, setActiveTab] = useState<ActiveTab>('general');
  const [localSettings, setLocalSettings] = useState(settings!);
  const [localMetrics, setLocalMetrics] = useState(metrics!);

  const handleClose = () => {
    dispatch({ type: 'SET_SETTINGS', payload: localSettings });
    dispatch({ type: 'SET_METRICS', payload: localMetrics });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-white dark:bg-gray-900 z-50 flex flex-col">
      <header className="bg-white/80 dark:bg-gray-800/50 backdrop-blur-sm p-4 flex justify-between items-center shadow-md w-full flex-shrink-0">
        <button
          onClick={handleClose}
          className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors duration-200"
        >
          <BackIcon />
          <span className="hidden sm:inline">{t('back')}</span>
        </button>
        <div className="text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">{t('settings')}</h2>
        </div>
        <div className="w-24 hidden sm:block"></div>
      </header>

      <main className="flex-grow overflow-y-auto p-6 md:p-10 text-gray-700 dark:text-gray-300">
        <div className="max-w-2xl mx-auto">
            <div className="mb-6 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
                <nav className="-mb-px flex space-x-6" aria-label="Tabs">
                    <TabButton tabId="general" label={t('settingsTabGeneral')} activeTab={activeTab} onClick={setActiveTab} />
                    <TabButton tabId="editor" label={t('editorSettings')} activeTab={activeTab} onClick={setActiveTab} />
                    <TabButton tabId="meta" label={t('settingsTabMetaData')} activeTab={activeTab} onClick={setActiveTab} />
          
                     {settings?.editorMode === 'advanced' && (
                        <TabButton tabId="metrics" label={t('settingsTabMetrics')} activeTab={activeTab} onClick={setActiveTab} />
                    )}
                    <TabButton tabId="testPage" label={t('testPageSettings')} activeTab={activeTab} onClick={setActiveTab} />
                </nav>
            </div>

            <div className="bg-gray-100 dark:bg-gray-800 rounded-lg shadow-inner p-6 md:p-8">
                {activeTab === 'general' && (
                    <GeneralSettings 
                        settings={localSettings} 
                        onSettingsChange={setLocalSettings} 
                        toolRanges={toolRanges} 
                    />
                )}
                {activeTab === 'editor' && (
                    <EditorSettings
                        settings={localSettings}
                        onSettingsChange={setLocalSettings}
                    />
                )}
                {activeTab === 'meta' && (
                    <MetaDataSettings
                         settings={localSettings} 
                         onSettingsChange={setLocalSettings} 
                    />
                )}
                {activeTab === 'testPage' && (
                    <TestPageSettings
                        settings={localSettings}
                        onSettingsChange={setLocalSettings}
                    />
                )}
                {activeTab === 'metrics' && settings?.editorMode === 'advanced' && (
                    <MetricsSettings
                        metrics={localMetrics}
                        onMetricsChange={setLocalMetrics}
                    />
                )}
            </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default React.memo(SettingsPage);
