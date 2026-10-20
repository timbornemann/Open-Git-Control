import { useEffect, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import { useNotificationDialog } from '@/components/ui/notificationDialogs';
import { useI18n } from '@/i18n';
import type { UserNoteSummaryDto } from '@/shared/userNotes';
import { UserNotesDialog } from './UserNotesDialog';
import { useUserNotesStatus } from './useUserNotesStatus';

export function UserNotesNotification() {
  const { tr } = useI18n();
  const status = useUserNotesStatus();
  const { dialogOpen, openDialog, closeDialog, cancelPendingDialog } = useNotificationDialog(1);
  const [pages, setPages] = useState<UserNoteSummaryDto[]>([]);
  const announced = useRef(new Set<string>());
  const unread = status?.notes.filter((note) => !note.acknowledged) || [];
  const offerKey = JSON.stringify(unread.map(({ id, revision }) => [id, revision]));
  const latestUnread = useRef(unread);
  latestUnread.current = unread;
  useEffect(() => {
    if (!latestUnread.current.some(({ id, revision }) => !announced.current.has(JSON.stringify([id, revision]))) || dialogOpen) return;
    setPages(latestUnread.current);
    openDialog(true);
    return cancelPendingDialog;
  }, [offerKey, dialogOpen, openDialog, cancelPendingDialog]);
  useEffect(() => {
    if (dialogOpen) for (const { id, revision } of pages) announced.current.add(JSON.stringify([id, revision]));
  }, [dialogOpen, pages]);
  return (
    <>
      {unread.length > 0 && (
        <button
          className="icon-btn activity-user-notes-btn"
          title={tr('Neue Nutzerhinweise', 'New user notices')}
          aria-label={tr('Neue Nutzerhinweise', 'New user notices')}
          onClick={() => {
            setPages(unread);
            openDialog();
          }}
        >
          <Info size={20} />
          <span className="activity-user-notes-badge" aria-hidden="true" />
        </button>
      )}
      <UserNotesDialog open={dialogOpen} pages={pages} onClose={closeDialog} />
    </>
  );
}
