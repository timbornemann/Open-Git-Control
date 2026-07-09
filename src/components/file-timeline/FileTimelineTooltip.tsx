import React from 'react';
import { useI18n } from '@/i18n';
import type { FileTimelineCommit, FileTimelineLayoutNode } from './types';

type Props = {
  activeCommit: FileTimelineCommit | null | undefined;
  hoveredNode: FileTimelineLayoutNode;
  x: number;
  y: number;
};

export const FileTimelineTooltip: React.FC<Props> = ({ activeCommit, hoveredNode, x, y }) => {
  const { t } = useI18n();

  return (
    <div
      style={{
        position: 'absolute',
        left: `${x}px`,
        top: `${y}px`,
        transform: 'translate(-50%, -100%)',
        pointerEvents: 'none',
        background: 'rgba(36, 29, 44, 0.95)',
        border: '1px solid var(--border-color)',
        borderRadius: '6px',
        padding: '10px 12px',
        boxShadow: '0 6px 18px rgba(0, 0, 0, 0.35)',
        maxWidth: '320px',
        fontSize: '0.78rem',
        color: 'var(--text-primary)',
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        backdropFilter: 'blur(3px)',
        transition: 'top 0.08s ease-out, left 0.08s ease-out',
      }}
    >
      <div style={{ fontWeight: 600, color: 'var(--text-primary)', wordBreak: 'break-all' }}>{hoveredNode.path}</div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <span
          style={{
            fontSize: '0.7rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            padding: '2px 6px',
            borderRadius: '3px',
            background: hoveredNode.type === 'folder' ? 'var(--bg-hover)' : 'rgba(255,255,255,0.06)',
            color: hoveredNode.type === 'folder' ? 'var(--text-accent)' : 'var(--text-secondary)',
          }}
        >
          {hoveredNode.type === 'folder' ? t('generated.components.filetimelinecanvas.folder_3dd8aff0') : t('generated.components.commitdetails.file_9d811416')}
        </span>

        {hoveredNode.status !== 'unchanged' && (
          <span
            style={{
              fontSize: '0.7rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              padding: '2px 6px',
              borderRadius: '3px',
              background:
                hoveredNode.status === 'added'
                  ? 'var(--status-success-soft)'
                  : hoveredNode.status === 'modified'
                    ? 'var(--status-info-soft)'
                    : 'var(--status-merged-soft)',
              color:
                hoveredNode.status === 'added' ? 'var(--status-success)' : hoveredNode.status === 'modified' ? 'var(--status-info)' : 'var(--status-merged)',
              border:
                hoveredNode.status === 'added'
                  ? '1px solid var(--status-success-border)'
                  : hoveredNode.status === 'modified'
                    ? '1px solid var(--status-info-border)'
                    : '1px solid var(--status-merged-border)',
            }}
          >
            {hoveredNode.status === 'added'
              ? t('generated.components.filetimelinecanvas.added_577df313')
              : hoveredNode.status === 'modified'
                ? t('generated.components.filetimelinecanvas.modified_e02f778a')
                : t('generated.components.filetimelinecanvas.renamed_732ebae5')}
          </span>
        )}
      </div>

      {hoveredNode.status !== 'unchanged' && activeCommit && (
        <div style={{ marginTop: '4px', borderTop: '1px solid var(--border-color)', paddingTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div
            style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {activeCommit.subject}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
            {activeCommit.author} - {new Date(activeCommit.date).toLocaleDateString()}
          </div>
        </div>
      )}

      {hoveredNode.type === 'folder' && (
        <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '4px', fontStyle: 'italic' }}>
          {hoveredNode.isCollapsed ? 'Klicken zum Ausklappen' : 'Klicken zum Einklappen'}
        </div>
      )}
    </div>
  );
};
