import { useCallback } from 'react';
import { useOptionalRepositoryContext } from '@/contexts/AppStateContext';

export type AppToast = {
  msg: string;
  isError: boolean;
};

/**
 * Publishes operation feedback to the single application-wide toast viewport.
 * The optional context keeps isolated component tests and embeddable previews
 * usable when they are rendered outside the application shell.
 */
export const useAppToast = () => {
  const repository = useOptionalRepositoryContext();

  return useCallback(
    (message: string, isError: boolean) => {
      if (message) repository?.onToast(message, isError);
    },
    [repository],
  );
};

export const useAppToastSetter = () => {
  const showToast = useAppToast();

  return useCallback(
    (toast: AppToast | null) => {
      if (toast) showToast(toast.msg, toast.isError);
    },
    [showToast],
  );
};
