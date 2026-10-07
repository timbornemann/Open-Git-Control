import { createContext, useContext } from 'react';
import type { NotificationController } from '@/types/notifications';

const NotificationContext = createContext<NotificationController | null>(null);
export const NotificationProvider = NotificationContext.Provider;

/** Uses the app's existing toast queue; it does not create a separate viewport. */
export function useNotifications(): NotificationController {
  const controller = useContext(NotificationContext);
  if (!controller) throw new Error('NotificationProvider is required.');
  return controller;
}
