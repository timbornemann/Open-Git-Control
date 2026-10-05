import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useUIContext } from '@/contexts/AppStateContext';
import { useI18n } from '@/i18n';
import type { RepositoryFileContextDto } from '@/shared/ipc/repositoryFiles';
import type { WorkingDirectoryNavigationGuard, WorkingDirectoryNavigationTarget } from '@/components/working-directory/workingDirectoryNavigationGuard';
import { runWorkingDirectoryNavigationAction } from '@/components/working-directory/workingDirectoryNavigationGuard';
import { fileViewerIdentity } from './fileViewerRequest';

export function useFileNavigation({
  context,
  dirty,
  save,
  discard,
  onClose,
  onCloseRequestChange,
  onNavigationGuardChange,
}: {
  context: RepositoryFileContextDto;
  dirty: boolean;
  save: () => Promise<boolean>;
  discard: () => void;
  onClose: () => void;
  onCloseRequestChange?: (request: (() => void) | null) => void;
  onNavigationGuardChange?: (guard: WorkingDirectoryNavigationGuard | null) => void;
}) {
  const { setConfirmDialog } = useUIContext();
  const { tr } = useI18n();
  const identity = fileViewerIdentity(context);
  const currentIdentity = useMemo(() => ({ identity }), [identity]);
  const identityRef = useRef<typeof currentIdentity | null>(currentIdentity);
  identityRef.current = currentIdentity;
  useLayoutEffect(() => {
    identityRef.current = currentIdentity;
    return () => {
      if (identityRef.current === currentIdentity) identityRef.current = null;
    };
  }, [currentIdentity]);
  const guardRef = useRef<WorkingDirectoryNavigationGuard>(() => {});
  const protect = (proceed: () => void, cancel?: () => void, toDiff = false) => {
    const advance = () => runWorkingDirectoryNavigationAction(proceed);
    if (!dirty) {
      advance();
      return;
    }
    setConfirmDialog({
      variant: 'danger',
      title: tr('Ungespeicherte Änderungen', 'Unsaved changes'),
      message: toDiff
        ? tr('Vor dem Wechsel zum Diff speichern oder den Entwurf verwerfen?', 'Save or discard the draft before switching to Diff?')
        : tr('Vor dem Wechsel speichern oder den Entwurf verwerfen?', 'Save or discard the draft before leaving this file?'),
      contextItems: [
        { label: tr('Datei', 'File'), value: context.path },
        { label: tr('Quelle', 'Source'), value: context.source },
      ],
      irreversible: false,
      consequences: tr('Beim Verwerfen gehen nur ungespeicherte Editoränderungen verloren.', 'Discarding only loses unsaved editor changes.'),
      confirmLabel: toDiff ? tr('Entwurf verwerfen und zum Diff', 'Discard draft and open Diff') : tr('Entwurf verwerfen', 'Discard draft'),
      secondaryActionLabel: toDiff ? tr('Speichern und zum Diff', 'Save and open Diff') : tr('Speichern und weiter', 'Save and continue'),
      secondaryActionVariant: 'default',
      onCancel: cancel,
      onConfirm: () => {
        if (identityRef.current === currentIdentity) {
          discard();
          advance();
        }
      },
      onSecondaryAction: async () => {
        if (identityRef.current !== currentIdentity) return;
        if (await save()) {
          if (identityRef.current === currentIdentity) advance();
        } else cancel?.();
      },
    });
  };
  const close = () => protect(onClose);
  const isSameFile = (target: WorkingDirectoryNavigationTarget) =>
    target.kind === 'file' && target.path === context.path && (!target.identity || target.identity === identity);
  guardRef.current = (target, proceed, cancel) => {
    if (isSameFile(target)) {
      if (target.kind === 'file' && target.view === 'diff') protect(proceed, cancel, true);
      else proceed();
    } else protect(proceed, cancel);
  };
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    onCloseRequestChange?.(() => closeRef.current());
    onNavigationGuardChange?.((...args) => guardRef.current(...args));
    return () => {
      onCloseRequestChange?.(null);
      onNavigationGuardChange?.(null);
    };
  }, [onCloseRequestChange, onNavigationGuardChange, identity]);
  return { close, protectNavigation: (proceed: () => void) => protect(proceed), protectDiff: (proceed: () => void) => protect(proceed, undefined, true) };
}
