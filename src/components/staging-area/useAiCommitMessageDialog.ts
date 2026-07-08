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
  const { t, tr } = useI18n();

  return useCallback(() => {
    setInputDialog({
      title: t('generated.components.staging_area.useaicommitmessagedialog.ai_commit_message_from_notes_ef03f5be'),
      message: t('generated.components.staging_area.useaicommitmessagedialog.enter_bullet_points_or_a_short_description_of_the_change_5e34114c'),
      fields: [
        {
          id: 'notes',
          label: t('generated.components.staging_area.stagingfilesections.changes_69ca4922'),
          placeholder: t('generated.components.staging_area.useaicommitmessagedialog.e_g_fixed_login_error_validated_settings_added_tests_9243134e'),
          required: true,
          multiline: true,
          rows: 8,
          helperText: t('generated.components.staging_area.useaicommitmessagedialog.uses_the_central_ai_commit_message_settings_8fb636c2'),
        },
      ],
      contextItems: [],
      irreversible: false,
      consequences: t('generated.components.staging_area.useaicommitmessagedialog.only_fills_commit_title_and_description_03623172'),
      confirmLabel: t('generated.components.staging_area.useaicommitmessagedialog.generate_c29b0144'),
      onSubmit: async (values) => {
        const message = await aiCommit.generateCommitMessageFromNotes(values.notes || '');
        if (!message) return;
        commitForm.setCommitMsg(message.title);
        commitForm.setCommitDescription(message.description || '');
      },
    });
  }, [aiCommit, commitForm, setInputDialog, tr]);
};
