import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Schedule } from '../types';

// クリップボードのデータ型
export type ClipboardData = Schedule | any; // 設備予約なども含む

interface ClipboardContextType {
  clipboard: ClipboardData | null;
  setClipboard: (data: ClipboardData | null) => void;
  copyToClipboard: (data: ClipboardData) => void;
  clearClipboard: () => void;
}

const ClipboardContext = createContext<ClipboardContextType | undefined>(undefined);

interface ClipboardProviderProps {
  children: ReactNode;
}

export const ClipboardProvider: React.FC<ClipboardProviderProps> = ({ children }) => {
  const [clipboard, setClipboard] = useState<ClipboardData | null>(null);

  const copyToClipboard = (data: any) => {
    setClipboard(data);
    // クリップボードにコピー
    if (navigator.clipboard && window.ClipboardItem) {
      const text = JSON.stringify(data, null, 2);
      const blob = new Blob([text], { type: 'text/plain' });
      const clipboardItem = new ClipboardItem({ 'text/plain': blob });
      navigator.clipboard.write([clipboardItem]).catch(err => {
        // フォールバック: 古いブラウザ用
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      });
    }
  };

  const clearClipboard = () => {
    setClipboard(null);
  };

  const value = {
    clipboard,
    setClipboard,
    copyToClipboard,
    clearClipboard
  };

  return (
    <ClipboardContext.Provider value={value}>
      {children}
    </ClipboardContext.Provider>
  );
};

export const useClipboard = (): ClipboardContextType => {
  const context = useContext(ClipboardContext);
  if (!context) {
    throw new Error('useClipboard must be used within a ClipboardProvider');
  }
  return context;
};
