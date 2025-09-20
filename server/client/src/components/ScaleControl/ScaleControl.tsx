import React, { useState, useEffect } from 'react';
import './ScaleControl.css';

interface ScaleControlProps {
  scale?: number;
  onScaleChange?: (scale: number) => void;
  initialScale?: number;
  minScale?: number;
  maxScale?: number;
  className?: string;
}

const ScaleControl: React.FC<ScaleControlProps> = ({
  scale: externalScale,
  onScaleChange,
  initialScale = 1.0,
  minScale = 0.5,
  maxScale = 3.0,
  className
}) => {
  const [internalScale, setInternalScale] = useState(initialScale);
  const [isVisible, setIsVisible] = useState(false);

  // Use external scale if provided, otherwise use internal scale
  const scale = externalScale !== undefined ? externalScale : internalScale;

  useEffect(() => {
    // ページ読み込み時にスケールを適用
    document.body.style.transform = `scale(${scale})`;
    document.body.style.transformOrigin = 'top left';
    document.body.style.width = `${100 / scale}%`;
    document.body.style.height = `${100 / scale}%`;
  }, [scale]);

  const handleScaleChange = (newScale: number) => {
    const clampedScale = Math.max(minScale, Math.min(maxScale, newScale));
    setInternalScale(clampedScale); // Update internal state
    
    // DOM要素にスケールを適用
    document.body.style.transform = `scale(${clampedScale})`;
    document.body.style.transformOrigin = 'top left';
    document.body.style.width = `${100 / clampedScale}%`;
    document.body.style.height = `${100 / clampedScale}%`;
    
    if (onScaleChange) {
      onScaleChange(clampedScale);
    }
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newScale = parseFloat(e.target.value);
    handleScaleChange(newScale);
  };

  const handlePresetScale = (presetScale: number) => {
    handleScaleChange(presetScale);
  };

  const handleReset = () => {
    handleScaleChange(1.0);
  };

  const toggleVisibility = () => {
    setIsVisible(!isVisible);
  };

  return (
    <div className={`scale-control ${className || ''}`}>
      <button 
        className="scale-toggle-btn"
        onClick={toggleVisibility}
        title="スケール調整"
      >
        🔍 {Math.round(scale * 100)}%
      </button>
      
      {isVisible && (
        <div className="scale-panel">
          <div className="scale-header">
            <span className="scale-title">表示スケール</span>
            <button className="scale-close" onClick={toggleVisibility}>×</button>
          </div>
          
          <div className="scale-content">
            <div className="scale-slider-container">
              <input
                type="range"
                className="scale-slider"
                min={minScale}
                max={maxScale}
                step="0.1"
                value={scale}
                onChange={handleSliderChange}
              />
              <div className="scale-value">{Math.round(scale * 100)}%</div>
            </div>
            
            <div className="scale-presets">
              <button 
                className={`scale-preset ${scale === 0.5 ? 'active' : ''}`}
                onClick={() => handlePresetScale(0.5)}
              >
                50%
              </button>
              <button 
                className={`scale-preset ${scale === 0.75 ? 'active' : ''}`}
                onClick={() => handlePresetScale(0.75)}
              >
                75%
              </button>
              <button 
                className={`scale-preset ${scale === 1.0 ? 'active' : ''}`}
                onClick={() => handlePresetScale(1.0)}
              >
                100%
              </button>
              <button 
                className={`scale-preset ${scale === 1.25 ? 'active' : ''}`}
                onClick={() => handlePresetScale(1.25)}
              >
                125%
              </button>
              <button 
                className={`scale-preset ${scale === 1.5 ? 'active' : ''}`}
                onClick={() => handlePresetScale(1.5)}
              >
                150%
              </button>
              <button 
                className={`scale-preset ${scale === 2.0 ? 'active' : ''}`}
                onClick={() => handlePresetScale(2.0)}
              >
                200%
              </button>
            </div>
            
            <div className="scale-actions">
              <button className="scale-reset" onClick={handleReset}>
                リセット
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScaleControl;