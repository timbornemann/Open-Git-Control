import { useCallback, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { ConfirmDialogState } from '@/app/state/contracts';
import { getCommitFormDraft, updateCommitFormDraft } from '@/components/staging-area/commitFormDraft';
import { useI18n } from '@/i18n';
import { aiClient } from '@/services/aiClient';
import type { AppSettingsDto } from '@/types/appDtos';
import type { PlannerProject } from '@/types/projectPlanner';
import { copyTextToClipboard } from '@/utils/clipboard';
import { openStagingCommitArea } from '@/utils/layoutPreferences';
import { buildPlannerAgentPrompt, buildPlannerCommitNotes, sortPlannerPromptItemsByPriority, type PlannerPromptItem } from '@/utils/plannerAiPrompts';

export type PlannerCommitMessageItem = PlannerPromptItem & {
  id?: string;
  persistedStatus?: PlannerPromptItem['status'];
};

type UsePlannerAiActionsParams = {
  project: PlannerProject | null;
  settings: AppSettingsDto;
  activateRepositoryProject: (repoPath: string) => Promise<boolean>;
  markItemsDone: (items: PlannerCommitMessageItem[]) => Promise<void>;
  notify: (message: string, isError: boolean) => void;
  setConfirmDialog: Dispatch<SetStateAction<ConfirmDialogState | null>>;
};

export const usePlannerAiActions = ({ project, settings, activateRepositoryProject, markItemsDone, notify, setConfirmDialog }: UsePlannerAiActionsParams) => {
  const { tr } = useI18n();
  const [isAiCommitGenerating, setIsAiCommitGenerating] = useState(false);
  const isGeneratingRef = useRef(false);

  const copyPrompt = useCallback(
    async (items: PlannerPromptItem[]) => {
      if (!project || items.length === 0) return;
      const copied = await copyTextToClipboard(buildPlannerAgentPrompt({ project, items, language: settings.aiCommitMessageLanguage }));
      notify(
        copied ? tr('Agent-Prompt kopiert.', 'Agent prompt copied.') : tr('Agent-Prompt konnte nicht kopiert werden.', 'Could not copy agent prompt.'),
        !copied,
      );
    },
    [notify, project, settings.aiCommitMessageLanguage, tr],
  );

  const generateCommitMessage = useCallback(
    (items: PlannerCommitMessageItem[]) => {
      const repoPath = project?.repoPath;
      if (!project || !repoPath || items.length === 0 || isGeneratingRef.current) return;

      const run = async () => {
        if (isGeneratingRef.current) return;
        isGeneratingRef.current = true;
        setIsAiCommitGenerating(true);
        try {
          if (!aiClient.isAvailable()) {
            notify(tr('Die KI-Funktion ist derzeit nicht verfuegbar.', 'The AI feature is currently unavailable.'), true);
            return;
          }

          const notes = buildPlannerCommitNotes({ project, items, language: settings.aiCommitMessageLanguage });
          const result = await aiClient.generateCommitMessage({ notes });
          if (!result.success) {
            notify(result.error || tr('KI-Commit-Nachricht konnte nicht erstellt werden.', 'Could not create AI commit message.'), true);
            return;
          }

          const activated = await activateRepositoryProject(repoPath);
          if (!activated) return;

          updateCommitFormDraft(
            repoPath,
            {
              commitMsg: result.data.title,
              commitDescription: result.data.description || '',
            },
            settings.commitTemplate,
          );
          openStagingCommitArea();
          await markItemsDone(items);
          notify(tr('KI-Commit-Nachricht in die Staging-Ansicht uebernommen.', 'AI commit message added to the staging view.'), false);
        } catch (error: unknown) {
          notify(error instanceof Error ? error.message : tr('KI-Commit-Nachricht konnte nicht erstellt werden.', 'Could not create AI commit message.'), true);
        } finally {
          isGeneratingRef.current = false;
          setIsAiCommitGenerating(false);
        }
      };

      const draft = getCommitFormDraft(repoPath, settings.commitTemplate);
      if (!draft.commitMsg.trim() && !draft.commitDescription.trim()) {
        void run();
        return;
      }

      setConfirmDialog({
        variant: 'confirm',
        title: tr('Commit-Entwurf ersetzen?', 'Replace commit draft?'),
        message: tr(
          'In der Staging-Ansicht gibt es bereits einen Commit-Entwurf. Die KI-Nachricht ersetzt Titel und Beschreibung erst nach deiner Bestaetigung.',
          'The staging view already contains a commit draft. The AI message will replace its title and description after confirmation.',
        ),
        contextItems: [{ label: tr('Aktueller Titel', 'Current title'), value: draft.commitMsg || tr('(nur Beschreibung)', '(description only)') }],
        irreversible: false,
        consequences: tr('Der bisherige Entwurf wird nur in dieser App-Sitzung ersetzt.', 'The existing draft is replaced only in this app session.'),
        confirmLabel: tr('KI-Nachricht erstellen', 'Create AI message'),
        onConfirm: run,
      });
    },
    [activateRepositoryProject, markItemsDone, notify, project, setConfirmDialog, settings.aiCommitMessageLanguage, settings.commitTemplate, tr],
  );

  return {
    copyItemPrompt: (item: PlannerPromptItem) => copyPrompt([item]),
    copyStatusPrompt: (items: PlannerPromptItem[]) => copyPrompt(sortPlannerPromptItemsByPriority(items)),
    generateCommitMessageForItem: (item: PlannerCommitMessageItem) => generateCommitMessage([item]),
    generateCommitMessageForStatus: generateCommitMessage,
    isAiCommitGenerating,
  };
};
