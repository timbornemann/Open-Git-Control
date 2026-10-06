import { Button } from '@/components/ui/Button';
import { useI18n } from '@/i18n';
import { useAppToast } from '@/hooks/useAppToast';

export function ReleaseNotesActions({ body, tagName }: { body: string; tagName: string }) {
  const { tr } = useI18n();
  const toast = useAppToast();
  return (
    <div className="release-notes-actions">
      <Button
        variant="ghost"
        size="xs"
        disabled={!body}
        onClick={() => {
          void navigator.clipboard.writeText(body).catch(() => toast(tr('Notes konnten nicht kopiert werden.', 'Could not copy notes.'), true));
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
    </div>
  );
}
