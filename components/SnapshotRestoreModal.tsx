
import React, { useState, useEffect } from 'react';
import { useLocale } from '../contexts/LocaleContext';
import { ProjectSnapshot } from '../types';
import { TrashIcon, HistoryIcon, CheckCircleIcon } from '../constants';
import Modal from './Modal';
import * as dbService from '../services/dbService';

interface SnapshotRestoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRestore: (snapshotData: any) => void;
  projectId: number;
}

const SnapshotRestoreModal: React.FC<SnapshotRestoreModalProps> = ({ isOpen, onClose, onRestore, projectId }) => {
  const { t } = useLocale();
  const [snapshots, setSnapshots] = useState<ProjectSnapshot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadSnapshots();
    }
  }, [isOpen, projectId]);

  const loadSnapshots = async () => {
    setIsLoading(true);
    try {
      const list = await dbService.getSnapshots(projectId);
      setSnapshots(list);
      if (list.length > 0) {
          setSelectedSnapshotId(list[0].id!); // Default select newest
      }
    } catch (error) {
      console.error("Failed to load snapshots", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: number) => {
      e.stopPropagation();
      try {
          await dbService.deleteSnapshot(id);
          setSnapshots(prev => prev.filter(s => s.id !== id));
          if (selectedSnapshotId === id) {
              setSelectedSnapshotId(null);
          }
      } catch (error) {
          console.error("Failed to delete snapshot", error);
      }
  };

  const handleConfirmRestore = () => {
      const selected = snapshots.find(s => s.id === selectedSnapshotId);
      if (selected) {
          onRestore(selected.data);
      }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('versionHistory')}
      size="md"
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 bg-gray-500 text-white font-semibold rounded-lg hover:bg-gray-600 transition-colors">
            {t('cancel')}
          </button>
          <button 
            onClick={handleConfirmRestore} 
            disabled={!selectedSnapshotId}
            className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors disabled:bg-indigo-400 disabled:cursor-not-allowed"
          >
            {t('restore')}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
            {t('snapshotRestoreDescription')}
        </p>
        
        {isLoading ? (
            <div className="flex justify-center p-8 text-gray-500">{t('loading')}</div>
        ) : snapshots.length === 0 ? (
            <div className="text-center p-8 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg text-gray-500">
                {t('noSnapshotsFound')}
            </div>
        ) : (
            <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
                {snapshots.map((snapshot, index) => (
                    <div 
                        key={snapshot.id}
                        onClick={() => setSelectedSnapshotId(snapshot.id!)}
                        className={`relative flex items-center p-3 rounded-lg border-2 cursor-pointer transition-all group
                            ${selectedSnapshotId === snapshot.id 
                                ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20' 
                                : 'border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700 bg-white dark:bg-gray-800'}
                        `}
                    >
                        <div className="flex-shrink-0 mr-3 text-gray-500 dark:text-gray-400">
                             {selectedSnapshotId === snapshot.id ? <CheckCircleIcon className="w-6 h-6 text-indigo-600" /> : <HistoryIcon />}
                        </div>
                        <div className="flex-grow">
                            <h4 className="font-bold text-gray-900 dark:text-white">
                                {index === 0 ? t('latestSnapshot') : t('snapshotLabel', { index: snapshots.length - index })}
                            </h4>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                {new Date(snapshot.timestamp).toLocaleString()}
                            </p>
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                                {t('glyphCount', { count: snapshot.data.glyphs.length })}
                            </p>
                        </div>
                        <button 
                            onClick={(e) => handleDelete(e, snapshot.id!)}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-full transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                            title={t('deleteSnapshot')}
                        >
                            <TrashIcon />
                        </button>
                    </div>
                ))}
            </div>
        )}
      </div>
    </Modal>
  );
};

export default SnapshotRestoreModal;
