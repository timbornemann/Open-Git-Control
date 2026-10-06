import { Button } from '@/components/ui/Button';
import { useI18n } from '@/i18n';
import { useState } from 'react';

export function ReleaseNotesActions({ body, tagName }: { body: string; tagName: string }) {
  const { tr } = useI18n();
  const [error, setError] = useState('');
  return (
    <div className="release-notes-actions">
      <Button
        variant="ghost"
        size="xs"
        disabled={!body}
        onClick={() => {
          setError('');
          void navigator.clipboard.writeText(body).catch(() => setError(tr('Notes konnten nicht kopiert werden.', 'Could not copy notes.')));
        }}
      >
        {tr('Notes kopieren', 'Copy notes')}
      </Button>
      <Button
        variant="ghost"
        size="xs"
        disabled={!body}
        onClick={() => {
          const url = URL.createObjectURL(new Blob([body], { type: 'text/markdown;charset=utf-8' }));
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = `${tagName.replace(/[^a-z\d_.-]/gi, '_') || 'release'}-notes.md`;
          anchor.click();
          URL.revokeObjectURL(url);
        }}
      >
        {tr('Notes als Datei speichern', 'Save notes as file')}
      </Button>
      {error && <span role="alert">{error}</span>}
    </div>
  );
}
