
import React from 'react';
import { useLocale } from '../../contexts/LocaleContext';
import { TransformIcon, SettingsIcon, CompareIcon, TrashIcon, CloseIcon, BatchIcon } from '../../constants';

interface DrawingBatchToolbarProps {
    selectionSize: number;
    onSelectVisible: () => void;
    onSelectAll: () => void;
    onSelectNone: () => void;
    onTransform: () => void;
    onProperties: () => void;
    onCompare: () => void;
    onDelete: () => void;
    onClose: () => void;
}

const DrawingBatchToolbar: React.FC<DrawingBatchToolbarProps> = (props) => {
    const { t } = useLocale();

    return (
        <div className="fixed inset-x-0 bottom-6 sm:bottom-auto sm:top-24 flex justify-center z-[60] px-4 pointer-events-none">
            <div className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-md rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-2 flex flex-col sm:flex-row items-center gap-2 sm:gap-4 pointer-events-auto animate-fade-in-up w-full max-w-4xl">
                
                {/* Selection Info Section */}
                <div className="flex items-center gap-3 pr-4 border-b sm:border-b-0 sm:border-r border-gray-200 dark:border-gray-700 w-full sm:w-auto pb-2 sm:pb-0 justify-center">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-500/30">
                        <span className="font-black text-sm">{props.selectionSize}</span>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-1">
                        <button onClick={props.onSelectVisible} className="px-2 py-1 text-[10px] font-bold uppercase tracking-tight bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors">{t('selectVisible')}</button>
                        <button onClick={props.onSelectAll} className="px-2 py-1 text-[10px] font-bold uppercase tracking-tight bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors">{t('selectAll')}</button>
                        <button onClick={props.onSelectNone} disabled={props.selectionSize === 0} className="px-2 py-1 text-[10px] font-bold uppercase tracking-tight bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-30 transition-colors">{t('selectNone')}</button>
                    </div>
                </div>

                {/* Main Actions Section */}
                <div className="flex flex-wrap items-center justify-center gap-2 flex-grow">
                    <button 
                        onClick={props.onTransform} 
                        disabled={props.selectionSize === 0}
                        className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white font-bold text-sm rounded-xl hover:bg-teal-700 disabled:opacity-30 transition-all shadow-md active:scale-95"
                    >
                        <TransformIcon className="w-4 h-4" />
                        <span className="hidden lg:inline">{t('transform')}</span>
                    </button>
                    <button 
                        onClick={props.onProperties} 
                        disabled={props.selectionSize === 0}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-bold text-sm rounded-xl hover:bg-indigo-700 disabled:opacity-30 transition-all shadow-md active:scale-95"
                    >
                        <SettingsIcon className="w-4 h-4" />
                        <span className="hidden lg:inline">{t('editProperties')}</span>
                    </button>
                    <button 
                        onClick={props.onCompare} 
                        disabled={props.selectionSize === 0}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-bold text-sm rounded-xl hover:bg-blue-700 disabled:opacity-30 transition-all shadow-md active:scale-95"
                    >
                        <CompareIcon className="w-4 h-4" />
                        <span className="hidden lg:inline">{t('compare')}</span>
                    </button>
                    <button 
                        onClick={props.onDelete} 
                        disabled={props.selectionSize === 0}
                        className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white font-bold text-sm rounded-xl hover:bg-red-700 disabled:opacity-30 transition-all shadow-md active:scale-95"
                    >
                        <TrashIcon className="w-4 h-4" />
                        <span className="hidden lg:inline">{t('delete')}</span>
                    </button>
                </div>

                {/* Exit Action */}
                <div className="pl-4 sm:border-l border-gray-200 dark:border-gray-700 flex-shrink-0">
                    <button 
                        onClick={props.onClose} 
                        className="p-2.5 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-xl hover:bg-gray-300 dark:hover:bg-gray-600 transition-all"
                        title="Exit Selection Mode"
                    >
                        <CloseIcon className="w-5 h-5" />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default React.memo(DrawingBatchToolbar);
