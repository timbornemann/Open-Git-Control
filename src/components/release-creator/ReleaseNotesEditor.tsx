import { useId, useMemo, useState } from 'react';
import { Eye, FileText } from 'lucide-react';
import { useI18n } from '@/i18n';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { handleMarkdownPreviewClick } from '@/components/ui/markdownPreviewNavigation';
import { MarkdownPreviewPane } from '@/components/diff-viewer/MarkdownPreviewPane';
import { applyMarkdownPreviewImageDataUrls, renderMarkdownToSanitizedHtml } from '@/utils/markdownPreview';
import '@/styles/markdown-preview.css';
import './releaseNotesEditor.css';

type Props = {
  body: string;
  disabled: boolean;
  onChange: (body: string) => void;
};

export function ReleaseNotesEditor({ body, disabled, onChange }: Props) {
  const { t, tr } = useI18n();
  const editorId = useId();
  const [preview, setPreview] = useState(false);
  const html = useMemo(() => (preview ? applyMarkdownPreviewImageDataUrls(renderMarkdownToSanitizedHtml(body), {}, true) : ''), [body, preview]);
  const label = t('generated.components.releasecreator.release_notes_markdown_3ec01efd');

  return (
    <div className="release-notes-editor">
      <div className="release-notes-editor-toolbar">
        <label className="release-field-label" htmlFor={editorId}>
          {label}
        </label>
        <SegmentedControl<'edit' | 'preview'>
          className="release-notes-view-switch"
          ariaLabel={tr('Notes-Ansicht', 'Notes view')}
          size="xs"
          value={preview ? 'preview' : 'edit'}
          onChange={(view) => setPreview(view === 'preview')}
          options={[
            {
              value: 'edit',
              label: (
                <>
                  <FileText size={13} aria-hidden="true" />
                  {tr('Bearbeiten', 'Edit')}
                </>
              ),
            },
            {
              value: 'preview',
              label: (
                <>
                  <Eye size={13} aria-hidden="true" />
                  {tr('Vorschau', 'Preview')}
                </>
              ),
            },
          ]}
        />
      </div>

      {preview ? (
        <div className="release-notes-preview" role="region" aria-label={tr('Release-Notes-Vorschau', 'Release notes preview')} tabIndex={0}>
          <MarkdownPreviewPane
            markdownPreview={{ loading: false, error: null, html }}
            onPreviewClick={handleMarkdownPreviewClick}
            emptyMessage={tr(
              'Noch keine Release Notes. Zum Bearbeiten wechseln oder Notes erstellen.',
              'No release notes yet. Switch to Edit or generate notes.',
            )}
          />
        </div>
      ) : (
        <textarea
          id={editorId}
          className="release-textarea release-textarea--editor"
          value={body}
          onChange={(event) => onChange(event.target.value)}
          rows={20}
          disabled={disabled}
          placeholder={t('generated.components.releasecreator.added_changed_fixed_4361f5e9')}
        />
      )}
    </div>
  );
}
