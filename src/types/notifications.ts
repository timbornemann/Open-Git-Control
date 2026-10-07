import type { ToastMessage } from './git';

export type NotificationMessage = ToastMessage & {
  kind?: 'success' | 'error' | 'info' | 'warning' | 'progress';
  title?: string;
  detail?: string;
  /** null is an indeterminate phase, never an estimated percentage. */
  progress?: { value: number | null; label: string };
  actions?: { label: string; onClick: () => void; disabled?: boolean }[];
  /** null keeps the notification until it is completed or dismissed. */
  autoHideMs?: number | null;
  dismissible?: boolean;
};
export type NotificationEntry = NotificationMessage & { id: number };
export type NotificationController = {
  publish: (message: NotificationMessage) => number;
  update: (id: number, message: NotificationMessage) => boolean;
  dismiss: (id: number) => void;
};
