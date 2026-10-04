import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { InputDialogState } from '@/app/state/contracts';
import { hostingClient } from '@/services/hostingClient';
import { deriveRepoNameFromCloneSource, isCloneSourceLikelyRemote } from './repoWorkflowUtils';
import type { TranslationVariables } from '@/i18n';
import type { HostingConnection } from '@/types/hostingDtos';

type Params = {
  cloneRepository: (source: string, options: { repoName: string; targetName?: string; connectionId?: string }) => Promise<boolean>;
  setInputDialog: Dispatch<SetStateAction<InputDialogState | null>>;
  setGitActionToast: (toast: { msg: string; isError: boolean }) => void;
  t: (key: string, variables?: TranslationVariables) => string;
  tr: (de: string, en: string) => string;
};

export const useRepositoryCreationWorkflow = ({ cloneRepository, setInputDialog, setGitActionToast, t, tr }: Params) => {
  const handleCloneByUrl = useCallback(async () => {
    let accounts: HostingConnection[] = [];
    try {
      accounts = (await hostingClient.request('connections', undefined)).filter((account) => account.authenticated);
    } catch (error) {
      setGitActionToast({ msg: error instanceof Error ? error.message : String(error), isError: true });
    }
    setInputDialog({
      title: t('generated.components.sidebar.repolist.clone_repository_from_url_b2415d88'),
      message: t('generated.components.layout.useappstate.enter_an_http_https_or_ssh_url_and_choose_a_target_direc_4e24ef1b'),
      fields: [
        {
          id: 'cloneSource',
          label: t('generated.components.layout.useappstate.clone_url_449646ea'),
          placeholder: 'https://git.example.org/team/repository.git',
          required: true,
          validate: (value) =>
            !value.trim() || isCloneSourceLikelyRemote(value.trim())
              ? null
              : tr('Bitte eine HTTP-, HTTPS- oder SSH-URL eingeben.', 'Enter an HTTP, HTTPS, or SSH URL.'),
        },
        {
          id: 'connectionId',
          label: tr('Hosting-Konto', 'Hosting account'),
          type: 'select',
          defaultValue: '',
          options: [
            { value: '', label: tr('SSH / Git-Zugangsdaten des Systems', 'SSH / system Git credentials') },
            ...accounts.map((account) => ({ value: account.id, label: `${account.label} · ${account.username ?? account.baseUrl}` })),
          ],
        },
        {
          id: 'targetName',
          label: t('generated.components.layout.useappstate.folder_name_optional_bcb3f976'),
          placeholder: t('generated.components.layout.useappstate.default_name_from_url_3a3ad316'),
          required: false,
        },
      ],
      contextItems: [],
      irreversible: false,
      consequences: t('generated.components.layout.useappstate.a_target_folder_will_be_created_and_the_repository_will_c295fbf1'),
      confirmLabel: t('generated.components.layout.useappstate.clone_6a063226'),
      onSubmit: async (values) => {
        const source = String(values.cloneSource || '').trim();
        if (!isCloneSourceLikelyRemote(source)) return;
        const cloned = await cloneRepository(source, {
          repoName: deriveRepoNameFromCloneSource(source),
          targetName: values.targetName?.trim() || undefined,
          connectionId: values.connectionId || undefined,
        });
        if (cloned) setGitActionToast({ msg: t('generated.components.layout.useappstate.repository_cloned_successfully_7b3b2cd9'), isError: false });
      },
    });
  }, [cloneRepository, setGitActionToast, setInputDialog, t, tr]);
  return { handleCloneByUrl };
};
