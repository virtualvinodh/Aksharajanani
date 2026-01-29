import React, { useRef } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl';
  titleClassName?: string;
  closeOnBackdropClick?: boolean;
}

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl',
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
  const mouseDownTargetIsBackdrop = useRef(false);

  if (!isOpen) return null;

  const handleBackdropMouseDown = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      mouseDownTargetIsBackdrop.current = true;
    } else {
      mouseDownTargetIsBackdrop.current = false;
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (!closeOnBackdropClick) return;
    
    // Only close if the mouse down happened on the backdrop AND the click happened on the backdrop.
    // This prevents closing when selecting text (mousedown inside -> mouseup outside).
    if (mouseDownTargetIsBackdrop.current && e.target === e.currentTarget) {
      onClose();
    }
    // Reset for next interaction
    mouseDownTargetIsBackdrop.current = false;
  };

  return (
    <div 
      className="fixed inset-0 bg-black/60 dark:bg-gray-900/80 z-[100] flex items-center justify-center p-4 animate-fade-in-up" 
      style={{ animationDuration: '0.2s' }}
      onMouseDown={handleBackdropMouseDown}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div 
        className={`bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full ${sizeClasses[size]}`} 
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
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