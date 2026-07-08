import { useCallback } from 'react';
import { useI18n } from '../../i18n';
import type { InputDialogState } from './types';
import type { useAiCommit } from './useAiCommit';
import type { useCommitForm } from './useCommitForm';

type UseAiCommitMessageDialogParams = {
  aiCommit: ReturnType<typeof useAiCommit>;
  commitForm: ReturnType<typeof useCommitForm>;
  setInputDialog: (dialog: InputDialogState | null) => void;
};

export const useAiCommitMessageDialog = ({
  aiCommit,
  commitForm,
  setInputDialog,
}: UseAiCommitMessageDialogParams) => {
  const { tr } = useI18n();

  return useCallback(() => {
    setInputDialog({
      title: tr('KI Commit-Message aus Notizen', 'AI commit message from notes'),
      message: tr('Gib Stichpunkte oder eine kurze Beschreibung der Aenderungen ein.', 'Enter bullet points or a short description of the changes.'),
      fields: [
        {
          id: 'notes',
          label: tr('Aenderungen', 'Changes'),
          placeholder: tr('z.B. Login-Fehler behoben, Settings validiert, Tests ergaenzt...', 'e.g. fixed login error, validated settings, added tests...'),
          required: true,
          multiline: true,
          rows: 8,
          helperText: tr('Verwendet die zentralen KI-Commit-Message-Einstellungen.', 'Uses the central AI commit message settings.'),
        },
      ],
      contextItems: [],
      irreversible: false,
      consequences: tr('Fuellt nur Commit-Titel und Beschreibung aus.', 'Only fills commit title and description.'),
      confirmLabel: tr('Generieren', 'Generate'),
      onSubmit: async (values) => {
        const message = await aiCommit.generateCommitMessageFromNotes(values.notes || '');
        if (!message) return;
        commitForm.setCommitMsg(message.title);
        commitForm.setCommitDescription(message.description || '');
      },
    });
  }, [aiCommit, commitForm, setInputDialog, tr]);
};
