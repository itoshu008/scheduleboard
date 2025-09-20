import React, { useEffect, useRef, useState } from 'react';
import './ManagementTabs.css';

interface ManagementTabsProps {
  isVisible: boolean;
  onClose: () => void;
  onNavigate: (path: string) => void;
  onScheduleRegister: () => void;
  colors: string[];
}

const ManagementTabs: React.FC<ManagementTabsProps> = ({
  isVisible,
  onClose,
  onNavigate,
  onScheduleRegister,
  colors
}) => {
  const tabsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tabsRef.current && !tabsRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isVisible) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isVisible, onClose]);

  // console.log('ManagementTabs isVisible:', isVisible);
  
  if (!isVisible) return null;

  return (
    <div className="management-tabs-overlay">
      <div className="management-tabs" ref={tabsRef}>
        <div className="tabs-header">
          <h3>登録管理</h3>
          <button className="close-btn" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="tabs-content">
          <button 
            className="tab-btn"
            onClick={onScheduleRegister}
          >
            スケジュール登録
          </button>
          <button 
            className="tab-btn"
            onClick={() => onNavigate('/management/departments')}
          >
            部署登録
          </button>
          <button 
            className="tab-btn"
            onClick={() => onNavigate('/management/employees')}
          >
            社員登録
          </button>
          <button 
            className="tab-btn"
            onClick={() => onNavigate('/management/equipment')}
          >
            設備登録
          </button>
          <button 
            className="tab-btn"
            onClick={() => onNavigate('/management/templates')}
          >
            テンプレート
          </button>
        </div>
      </div>
    </div>
  );
};

export default ManagementTabs;
