import React from 'react';
import { Maximize2, ZoomIn, ZoomOut } from 'lucide-react';
import { useI18n } from '@/i18n';

type Props = {
  onCenter: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
};

const buttonStyle: React.CSSProperties = {
  width: '32px',
  height: '32px',
  background: 'var(--bg-panel)',
  border: '1px solid var(--border-color)',
  color: 'var(--text-primary)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  borderRadius: '4px',
};

export const FileTimelineCanvasControls: React.FC<Props> = ({ onCenter, onZoomIn, onZoomOut }) => {
  const { t } = useI18n();

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '20px',
        right: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        zIndex: 10,
      }}
    >
      <button onClick={onZoomIn} className="diff-nav-btn" title={t('generated.components.filetimelinecanvas.zoom_in_deebaa4e')} style={buttonStyle}>
        <ZoomIn size={15} />
      </button>
      <button onClick={onZoomOut} className="diff-nav-btn" title={t('generated.components.filetimelinecanvas.zoom_out_b50cd9fb')} style={buttonStyle}>
        <ZoomOut size={15} />
      </button>
      <button onClick={onCenter} className="diff-nav-btn" title={t('generated.components.filetimelinecanvas.center_view_312a66fb')} style={buttonStyle}>
        <Maximize2 size={14} />
      </button>
    </div>
  );
};
