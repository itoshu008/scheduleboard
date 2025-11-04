import { useEffect, useCallback } from 'react';

export interface KeyboardShortcuts {
  onUndo?: () => void;
  onRedo?: () => void;
  onSave?: () => void;
  onDelete?: () => void;
  onCopy?: () => void;
  onPaste?: () => void;
  onEscape?: () => void;
}

export function useKeyboardShortcuts(shortcuts: KeyboardShortcuts) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // フォーム要素での入力中は無視
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || 
        target.tagName === 'TEXTAREA' || 
        target.contentEditable === 'true') {
      return;
    }

    const isCtrl = e.ctrlKey || e.metaKey; // Mac対応
    const isShift = e.shiftKey;
    const key = e.key.toLowerCase();

    // Ctrl+Z (Undo)
    if (isCtrl && !isShift && key === 'z' && shortcuts.onUndo) {
      e.preventDefault();
      e.stopPropagation();
      shortcuts.onUndo();
      return;
    }

    // Ctrl+Shift+Z または Ctrl+Y (Redo)
    if (isCtrl && (isShift && key === 'z' || key === 'y') && shortcuts.onRedo) {
      e.preventDefault();
      e.stopPropagation();
      shortcuts.onRedo();
      return;
    }

    // Ctrl+S (Save)
    if (isCtrl && key === 's' && shortcuts.onSave) {
      e.preventDefault();
      e.stopPropagation();
      shortcuts.onSave();
      return;
    }

    // Delete キー
    if (key === 'delete' && shortcuts.onDelete) {
      e.preventDefault();
      e.stopPropagation();
      shortcuts.onDelete();
      return;
    }

    // Ctrl+C (Copy)
    if (isCtrl && key === 'c' && shortcuts.onCopy) {
      e.preventDefault();
      e.stopPropagation();
      shortcuts.onCopy();
      return;
    }

    // Ctrl+V (Paste)
    if (isCtrl && key === 'v' && shortcuts.onPaste) {
      e.preventDefault();
      e.stopPropagation();
      shortcuts.onPaste();
      return;
    }

    // Escape キー
    if (key === 'escape' && shortcuts.onEscape) {
      e.preventDefault();
      e.stopPropagation();
      shortcuts.onEscape();
      return;
    }
  }, [shortcuts]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);
}
