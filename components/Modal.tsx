import React from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  titleClassName?: string;
  closeOnBackdropClick?: boolean;
}

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
};

const Modal: React.FC<ModalProps> = ({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  footer, 
  size = 'lg', 
  titleClassName, 
  closeOnBackdropClick = true 
}) => {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/60 dark:bg-gray-900/80 z-50 flex items-center justify-center p-4 animate-fade-in-up" 
      style={{ animationDuration: '0.2s' }}
      onClick={closeOnBackdropClick ? onClose : undefined}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div 
        className={`bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full ${sizeClasses[size]}`} 
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex justify-between items-center mb-4">
          <h2 id="modal-title" className={`text-2xl font-bold ${titleClassName || 'text-gray-900 dark:text-white'}`}>{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-800 dark:hover:text-white text-3xl leading-none" aria-label="Close modal">&times;</button>
        </header>
        <main className="text-gray-700 dark:text-gray-300 mb-6">
          {children}
        </main>
        <footer className="flex flex-wrap justify-end gap-3">
          {footer}
        </footer>
      </div>
    </div>
  );
};

export default React.memo(Modal);
