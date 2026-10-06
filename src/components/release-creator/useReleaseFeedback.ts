import { useEffect, useRef } from 'react';
import { useAppToast } from '@/hooks/useAppToast';
import { useI18n } from '@/i18n';
import type { HostingRelease } from '@/types/hostingDtos';

type Feedback = {
  targetLoading: boolean;
  missingTarget: boolean;
  targetError: string | null;
  contextLoading: boolean;
  contextError: string;
  contextWarning?: string;
  fallbackUsed: boolean;
  notesMessage: string;
  notesError: boolean;
  publicationError: string;
  created: HostingRelease | null;
};

/** Loading is not a missing configuration; feedback uses the app's single viewport. */
export function useReleaseFeedback(feedback: Feedback) {
  const toast = useAppToast();
  const { tr } = useI18n();
  const previous = useRef(new Map<string, string>());
  const createdId = useRef(feedback.created?.id);
  useEffect(() => {
    const messages: [string, string, boolean][] = [
      ['target', feedback.targetLoading ? '' : feedback.targetError || '', true],
      [
        'missing',
        feedback.missingTarget && !feedback.targetLoading && !feedback.targetError
          ? tr(
              'Hosting-Zuordnung fehlt. Verbinde ein Konto und ordne diesem Repository ein Veröffentlichungsziel zu.',
              'Hosting target missing. Connect an account and choose a publication target for this repository.',
            )
          : '',
        true,
      ],
      ['context', feedback.contextError, true],
      ['context-warning', feedback.contextLoading ? '' : feedback.contextWarning || '', false],
      [
        'baseline',
        feedback.fallbackUsed && !feedback.contextLoading
          ? tr(
              'Die Release-Basis oder vollständige Historie ist nicht verfügbar. Angezeigt werden die neuesten Commits.',
              'The release baseline or complete history is unavailable. Showing recent commits.',
            )
          : '',
        false,
      ],
      ['notes', feedback.notesMessage, feedback.notesError],
      ['publication', feedback.publicationError, true],
    ];
    for (const [kind, message, isError] of messages) {
      if (message && previous.current.get(kind) !== message) toast(message, isError);
      previous.current.set(kind, message);
    }
    if (feedback.created && feedback.created.id !== createdId.current)
      toast(tr(`Release erstellt: ${feedback.created.name}`, `Release created: ${feedback.created.name}`), false);
    createdId.current = feedback.created?.id;
  }, [feedback, toast, tr]);
}
