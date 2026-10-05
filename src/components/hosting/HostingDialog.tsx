import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { DialogFrame } from '@/components/DialogFrame';
import { useI18n } from '@/i18n';

export function HostingDialog({
  open,
  title,
  onClose,
  children,
  cancelLabel,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  cancelLabel?: string;
}) {
  const { tr } = useI18n();
  return createPortal(
    <div className="hosting-dialog">
      <DialogFrame open={open} title={title} onClose={onClose} closeOnBackdrop={false} cancelLabel={cancelLabel ?? tr('Schließen', 'Close')}>
        {children}
      </DialogFrame>
    </div>,
    document.body,
  );
}
