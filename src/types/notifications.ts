import type { ToastMessage } from './git';

export type GitErrorContext = {
  repoPath: string;
  remote?: string;
  url?: string;
  /** null explicitly selects system credentials. */
  connectionId?: string | null;
};

export type NotificationMessage = ToastMessage & {
  kind?: 'success' | 'error' | 'info' | 'warning' | 'progress';
  title?: string;
  detail?: string;
  technicalDetails?: string;
  gitContext?: GitErrorContext;
  /** Presentation has already captured the operation context and its remedies. */
  errorExplained?: boolean;
  /** null is an indeterminate phase, never an estimated percentage. */
  progress?: { value: number | null; label: string };
  actions?: { label: string; onClick: () => void; disabled?: boolean }[];
  /** null keeps the notification until it is completed or dismissed. */
  autoHideMs?: number | null;
  dismissible?: boolean;
};
export type NotificationEntry = NotificationMessage & { id: number };
export type NotificationController = {
  prepare?: (message: NotificationMessage) => NotificationMessage;
  publish: (message: NotificationMessage) => number;
  update: (id: number, message: NotificationMessage) => boolean;
  dismiss: (id: number) => void;
};
