import React from 'react';
import { AppSettings } from '../../types';
import { useLocale } from '../../contexts/LocaleContext';

interface MetaDataSettingsProps {
    settings: AppSettings;
    onSettingsChange: React.Dispatch<React.SetStateAction<AppSettings>>;
}

const MetaDataSettings: React.FC<MetaDataSettingsProps> = ({ settings, onSettingsChange }) => {
    const { t } = useLocale();

    const handleSettingChange = (key: keyof AppSettings) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        onSettingsChange(prev => ({
            ...prev,
            [key]: e.target.value
        }));
    };

    return (
        <div className="space-y-6">
            <div>
                <label htmlFor="font-manufacturer" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('fontMetaManufacturer')}</label>
                <input type="text" id="font-manufacturer" value={settings.manufacturer || ''} onChange={handleSettingChange('manufacturer')} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"/>
            </div>
            <div>
                <label htmlFor="font-designer" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('fontMetaDesigner')}</label>
                <input type="text" id="font-designer" value={settings.designer || ''} onChange={handleSettingChange('designer')} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"/>
            </div>
            <div>
                <label htmlFor="font-description" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('fontMetaDescription')}</label>
                <textarea id="font-description" value={settings.description || ''} onChange={handleSettingChange('description')} rows={3} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm resize-y"/>
            </div>
            <div>
                <label htmlFor="font-vendor-url" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('fontMetaVendorURL')}</label>
                <input type="url" id="font-vendor-url" value={settings.vendorURL || ''} onChange={handleSettingChange('vendorURL')} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"/>
            </div>
            <div>
                <label htmlFor="font-designer-url" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('fontMetaDesignerURL')}</label>
                <input type="url" id="font-designer-url" value={settings.designerURL || ''} onChange={handleSettingChange('designerURL')} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"/>
            </div>
            <div>
                <label htmlFor="font-license" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('fontMetaLicenseDescription')}</label>
                <textarea id="font-license" value={settings.licenseDescription || ''} onChange={handleSettingChange('licenseDescription')} rows={3} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm resize-y"/>
            </div>
             <div>
                <label htmlFor="font-license-url" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('fontMetaLicenseURL')}</label>
                <input type="url" id="font-license-url" value={settings.licenseInfoURL || ''} onChange={handleSettingChange('licenseInfoURL')} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"/>
            </div>
        </div>
    );
};

export default React.memo(MetaDataSettings);