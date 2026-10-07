import { useLayoutEffect, useRef } from 'react';
import type { GitJobEventDto } from '@/types/aiDtos';
import { useI18n } from '@/i18n';
import { useNotifications } from '@/contexts/NotificationContext';

/** Legacy Git recovery transfers also use the central notification viewport. */
export function GitTransferProgressNotification({ open, title, events }: { open: boolean; title: string | null; events: GitJobEventDto[] }) {
  const { t } = useI18n();
  const notifications = useNotifications();
  const id = useRef<number | null>(null);
  const heading = title || t('generated.components.layout.gittransferprogressoverlay.github_update_running_3a747d60');
  const message =
    events.filter((event) => event.message?.trim()).at(-1)?.message ||
    t('generated.components.layout.gittransferprogressoverlay.waiting_for_git_progress_66cb9173');
  useLayoutEffect(() => {
    if (!open) {
      if (id.current !== null) notifications.dismiss(id.current);
      id.current = null;
      return;
    }
    const notification = { title: heading, msg: message, isError: false, kind: 'progress' as const, autoHideMs: null, dismissible: false };
    if (id.current === null || !notifications.update(id.current, notification)) id.current = notifications.publish(notification);
  }, [open, heading, message, notifications]);
  useLayoutEffect(
    () => () => {
      if (id.current !== null) notifications.dismiss(id.current);
    },
    [notifications],
  );
  return null;
}
