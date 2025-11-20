
import React, { useEffect, useState, useCallback } from 'react';
import { useLocale } from '../contexts/LocaleContext';
import { UndoIcon } from '../constants';

interface NotificationProps {
  message: string;
  onClose: () => void;
  duration?: number;
  type?: 'success' | 'info' | 'error';
  onUndo?: () => void;
}

const Notification: React.FC<NotificationProps> = ({ message, onClose, duration = 3000, type = 'success', onUndo }) => {
  const { t } = useLocale();
  const [isExiting, setIsExiting] = useState(false);
  const closeTimerRef = React.useRef<number | null>(null);

  const handleClose = useCallback(() => {
    setIsExiting(true);
    closeTimerRef.current = window.setTimeout(() => {
        onClose();
    }, 500); // 500ms is the transition duration
  }, [onClose]);

  useEffect(() => {
    const exitTimer = setTimeout(handleClose, duration);
    return () => {
      clearTimeout(exitTimer);
      if(closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, [duration, handleClose]);

  const handleUndoClick = () => {
    if (onUndo) {
      onUndo();
    }
    // The explicit onClose() call was causing a race condition and is removed.
    // The onUndo callback is now responsible for showing the next notification,
    // which replaces this one in the state, correctly triggering an unmount.
  };

  const colorClasses = {
    success: 'bg-green-600 text-white dark:bg-green-500 dark:text-gray-900',
    info: 'bg-blue-600 text-white dark:bg-blue-500',
    error: 'bg-red-600 text-white dark:bg-red-500'
  };

  return (
    <div
      className={`fixed bottom-10 left-1/2 -translate-x-1/2 transform transition-all duration-500 ease-in-out z-[100]
                  ${isExiting ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'}`}
      role="alert"
    >
      <div className={`${colorClasses[type]} font-semibold px-4 py-3 rounded-lg shadow-xl flex items-center gap-4`}>
        <span>{message}</span>
        {onUndo && (
          <button
            onClick={handleUndoClick}
            className="flex items-center gap-1.5 font-bold uppercase text-xs px-3 py-1 rounded-full ml-2 transition-colors bg-yellow-400 text-black hover:bg-yellow-300 dark:bg-yellow-500 dark:hover:bg-yellow-400"
          >
            <UndoIcon />
            {t('undo')}
          </button>
        )}
      </div>
    </div>
  );
};
export default React.memo(Notification);