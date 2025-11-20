import React from 'react';
import { useLocale } from '../contexts/LocaleContext';

interface ProgressIndicatorProps {
  completed: number;
  total: number;
  progressTextKey: string;
}

const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({ completed, total, progressTextKey }) => {
  const { t } = useLocale();

  const isComplete = total > 0 ? completed >= total : true;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 100;

  const progressText = t(progressTextKey, { completed, total, percentage });

  return (
    <div className="px-4 py-2">
      <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
        {progressText}
      </div>
      <div className="w-full bg-gray-300 dark:bg-gray-700 rounded-full h-2 overflow-hidden" role="presentation">
        <div
          className={`${isComplete ? 'bg-green-500' : 'bg-indigo-600'} h-2 rounded-full transition-all duration-500`}
          style={{ width: `${percentage}%` }}
          role="progressbar"
          aria-valuenow={percentage}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={progressText}
        ></div>
      </div>
    </div>
  );
};

export default React.memo(ProgressIndicator);