import React, { useMemo } from 'react';
import { getConflictLineGutterKinds, splitContentLines, type ConflictGutterKind } from '../../utils/conflictLineGutter';

const gutterClassForKind = (kind: ConflictGutterKind): string => {
  switch (kind) {
    case 'ours':
      return 'conflict-gutter-num conflict-gutter-num--ours';
    case 'theirs':
      return 'conflict-gutter-num conflict-gutter-num--theirs';
    case 'marker':
      return 'conflict-gutter-num conflict-gutter-num--marker';
    default:
      return 'conflict-gutter-num conflict-gutter-num--neutral';
  }
};

export const ConflictSidePreview: React.FC<{ text: string; variant: 'ours' | 'theirs' }> = ({ text, variant }) => {
  const lines = useMemo(() => {
    if (!text) return ['(leer)'];
    return text.split(/\r?\n/);
  }, [text]);

  return (
    <>
      {lines.map((line, i) => (
        <div key={i} className={`conflict-preview-line conflict-preview-line--${variant}`}>
          <span className={`conflict-gutter-num conflict-gutter-num--${variant}`}>{i + 1}</span>
          <span className="conflict-preview-code">{line}</span>
        </div>
      ))}
    </>
  );
};

export const ConflictManualEditor = React.forwardRef<HTMLDivElement, {
  content: string;
  disabled: boolean;
  onChange: (next: string) => void;
}>(({ content, disabled, onChange }, ref) => {
  const lines = useMemo(() => splitContentLines(content), [content]);
  const gutterKinds = useMemo(() => getConflictLineGutterKinds(lines), [lines]);
  const textareaHeightPx = useMemo(() => {
    // Keep textarea height deterministic across platforms to avoid row rounding drift.
    const lineHeightPx = 18;
    const verticalPaddingPx = 24; // 12px top + 12px bottom (see index.css)
    return Math.max(lines.length, 1) * lineHeightPx + verticalPaddingPx;
  }, [lines.length]);

  return (
    <div className="conflict-manual-edit-scroll" ref={ref}>
      <div className="conflict-manual-edit-sync">
        <div className="conflict-manual-gutter-col" aria-hidden>
          {lines.map((_, i) => {
            const kind = gutterKinds[i] || 'neutral';
            return (
              <div key={i} className={`conflict-manual-gutter-line conflict-manual-gutter-line--${kind}`}>
                <span className={gutterClassForKind(kind)}>{i + 1}</span>
              </div>
            );
          })}
        </div>
        <div className="conflict-manual-code-col">
          <div className="conflict-manual-code-bg" aria-hidden>
            {lines.map((_, i) => {
              const kind = gutterKinds[i] || 'neutral';
              return (
                <div key={i} className={`conflict-manual-code-bg-line conflict-manual-code-bg-line--${kind}`} />
              );
            })}
          </div>
          <textarea
            className="conflict-manual-textarea"
            spellCheck={false}
            style={{ height: `${textareaHeightPx}px` }}
            value={content}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  );
});

ConflictManualEditor.displayName = 'ConflictManualEditor';
