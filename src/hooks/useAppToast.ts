import { useCallback } from 'react';
import { useOptionalRepositoryContext } from '@/contexts/AppStateContext';
import { emitTutorialFeedback } from '@/shared/tutorial/feedback';

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
  const onToast = useOptionalRepositoryContext()?.onToast;

  return useCallback(
    (message: string, isError: boolean) => {
      if (message) {
        onToast?.(message, isError);
        if (onToast) emitTutorialFeedback(message, isError);
      }
    },
    [onToast],
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
