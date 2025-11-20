
import { useEffect } from 'react';
import { Point } from '../../types';

interface DrawingShortcutsProps {
    onUndo: () => void;
    onRedo: () => void;
    onCopy: () => void;
    onCut: () => void;
    onPaste: () => void;
    onDelete: () => void;
    onMoveSelection: (delta: Point) => void;
    onNavigatePrev: () => void;
    onNavigateNext: () => void;
    canUndo: boolean;
    canRedo: boolean;
    hasSelection: boolean;
    hasClipboard: boolean;
    canNavigatePrev: boolean;
    canNavigateNext: boolean;
}

export const useDrawingShortcuts = ({
    onUndo, onRedo, onCopy, onCut, onPaste, onDelete, onMoveSelection,
    onNavigatePrev, onNavigateNext, canUndo, canRedo, hasSelection, hasClipboard,
    canNavigatePrev, canNavigateNext
}: DrawingShortcutsProps) => {

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
                return;
            }

            const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
            const isCtrlOrCmd = isMac ? e.metaKey : e.ctrlKey;
            let handled = false;

            if (isCtrlOrCmd) {
                switch (e.key.toLowerCase()) {
                    case 'z':
                        if (e.shiftKey) { if (canRedo) onRedo(); }
                        else { if (canUndo) onUndo(); }
                        handled = true;
                        break;
                    case 'c':
                        onCopy();
                        handled = true;
                        break;
                    case 'x':
                        if (hasSelection) onCut();
                        handled = true;
                        break;
                    case 'v':
                        if (hasClipboard) onPaste();
                        handled = true;
                        break;
                }
            } else {
                const shiftMult = e.shiftKey ? 10 : 1;
                switch (e.key) {
                    case 'ArrowLeft':
                        if (hasSelection) { onMoveSelection({ x: -1 * shiftMult, y: 0 }); handled = true; }
                        else if (canNavigatePrev) { onNavigatePrev(); handled = true; }
                        break;
                    case 'ArrowRight':
                        if (hasSelection) { onMoveSelection({ x: 1 * shiftMult, y: 0 }); handled = true; }
                        else if (canNavigateNext) { onNavigateNext(); handled = true; }
                        break;
                    case 'ArrowUp':
                        if (hasSelection) { onMoveSelection({ x: 0, y: -1 * shiftMult }); handled = true; }
                        break;
                    case 'ArrowDown':
                        if (hasSelection) { onMoveSelection({ x: 0, y: 1 * shiftMult }); handled = true; }
                        break;
                    case 'Delete':
                    case 'Backspace':
                        if (hasSelection) { onDelete(); handled = true; }
                        break;
                }
            }

            if (handled) e.preventDefault();
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onUndo, onRedo, onCopy, onCut, onPaste, onDelete, onMoveSelection, onNavigatePrev, onNavigateNext, canUndo, canRedo, hasSelection, hasClipboard, canNavigatePrev, canNavigateNext]);
};
