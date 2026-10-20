import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DialogFrame } from '@/components/DialogFrame';
import { Button } from '@/components/ui/Button';
import { handleMarkdownPreviewClick } from '@/components/ui/markdownPreviewNavigation';
import { useI18n } from '@/i18n';
import { appClient } from '@/services/appClient';
import type { UserNoteSummaryDto } from '@/shared/userNotes';
import { renderMarkdownToSanitizedHtml } from '@/utils/markdownPreview';
import '@/styles/markdown-preview.css';
import './userNotes.css';

type Props = { open: boolean; pages: UserNoteSummaryDto[]; initialId?: string; onClose: () => void };

export function UserNotesDialog({ open, pages, initialId, onClose }: Props) {
  const { tr } = useI18n();
  const [index, setIndex] = useState(0);
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const article = useRef<HTMLElement>(null);
  const page = pages[Math.min(index, Math.max(0, pages.length - 1))];
  const pageId = page?.id;
  const pageRevision = page?.revision;
  useEffect(() => {
    if (open)
      setIndex(
        Math.max(
          0,
          pages.findIndex((note) => note.id === initialId),
        ),
      );
  }, [open, initialId, pages]);
  useEffect(() => {
    if (!open || !pageId || !pageRevision) return;
    let active = true;
    setLoading(true);
    setHtml('');
    setError('');
    void appClient
      .getUserNote({ id: pageId, revision: pageRevision })
      .then((result) => {
        if (!active) return;
        if (!result.success) throw new Error(result.error);
        setHtml(
          renderMarkdownToSanitizedHtml(result.data.markdown, { dataUrls: result.data.images, missingLabel: tr('Bild nicht verfügbar', 'Image unavailable') }),
        );
      })
      .catch((failure: unknown) => {
        if (active) setError(failure instanceof Error ? failure.message : tr('Hinweis konnte nicht geladen werden.', 'Could not load this notice.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, pageId, pageRevision, tr]);
  useEffect(() => {
    article.current?.closest('.dialog-content')?.scrollTo?.({ top: 0 });
  }, [html]);

  const acknowledge = async () => {
    if (working) return;
    setWorking(true);
    setError('');
    try {
      const result = await appClient.acknowledgeUserNotes(pages.map(({ id, revision }) => ({ id, revision })));
      if (!result.success) throw new Error(result.error);
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : tr('Bestätigung konnte nicht gespeichert werden.', 'Could not save the acknowledgement.'));
    } finally {
      setWorking(false);
    }
  };

  const hasUnread = pages.some((note) => !note.acknowledged);
  return (
    <DialogFrame
      open={open}
      title={page ? `${tr('Nutzerhinweise', 'User notices')} · ${page.title}` : tr('Nutzerhinweise', 'User notices')}
      onClose={() => {
        if (!working) onClose();
      }}
      closeOnBackdrop={false}
      onConfirm={hasUnread ? () => void acknowledge() : undefined}
      confirmDisabled={working}
      confirmLabel={working ? tr('Wird gespeichert …', 'Saving …') : tr('Alle bestätigen', 'Acknowledge all')}
      cancelLabel={hasUnread ? tr('Später', 'Later') : tr('Schließen', 'Close')}
    >
      <div className="user-notes-reader">
        <nav className="user-notes-pagination" aria-label={tr('Hinweisseiten', 'Notice pages')}>
          <Button variant="secondary" icon={<ChevronLeft size={16} />} disabled={index === 0} onClick={() => setIndex((current) => current - 1)}>
            {tr('Zurück', 'Previous')}
          </Button>
          <span aria-live="polite">
            {Math.min(index + 1, pages.length)} / {pages.length}
          </span>
          <Button variant="secondary" icon={<ChevronRight size={16} />} disabled={index >= pages.length - 1} onClick={() => setIndex((current) => current + 1)}>
            {tr('Weiter', 'Next')}
          </Button>
        </nav>
        {loading && <p role="status">{tr('Hinweis wird geladen …', 'Loading notice …')}</p>}
        {error && (
          <p className="user-notes-error" role="alert">
            {error}
          </p>
        )}
        {!loading && html && (
          <article
            ref={article}
            className="markdown-preview-content user-notes-content"
            onClick={handleMarkdownPreviewClick}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}
      </div>
    </DialogFrame>
  );
}
