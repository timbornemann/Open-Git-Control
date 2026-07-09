import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { AppSettingsDto } from '@/global';
import type { AppTabId, InputDialogState } from '@/app/state/contracts';
import { githubClient } from '@/services/githubClient';
import { deriveRepoNameFromCloneSource, isCloneSourceLikelyRemote, normalizeGitHost, parseGithubRepoReference } from './repoWorkflowUtils';
import type { TranslationVariables } from '@/i18n';

type Toast = { msg: string; isError: boolean };
type Translate = (key: string, variables?: TranslationVariables) => string;

type GithubBridge = {
  isAuthenticated: boolean;
  cloneRepository: (cloneSource: string, options: { repoName: string; targetName?: string }) => Promise<boolean>;
};

type WorkspaceBridge = {
  setActiveTab: (tab: AppTabId) => void;
};

type Params = {
  github: GithubBridge;
  workspace: WorkspaceBridge;
  settings: Pick<AppSettingsDto, 'githubHost'>;
  setInputDialog: Dispatch<SetStateAction<InputDialogState | null>>;
  setGitActionToast: (toast: Toast) => void;
  t: Translate;
  tr: (deText: string, enText: string) => string;
};

export const useRepositoryCreationWorkflow = ({ github, workspace, settings, setInputDialog, setGitActionToast, t, tr }: Params) => {
  const cloneFromRemoteSource = useCallback(
    async (cloneSourceRaw: string, targetNameRaw?: string): Promise<boolean> => {
      const cloneSource = String(cloneSourceRaw || '').trim();
      if (!cloneSource) {
        setGitActionToast({ msg: t('generated.components.layout.useappstate.clone_source_is_required_0f140f6c'), isError: true });
        return false;
      }
      if (!isCloneSourceLikelyRemote(cloneSource)) {
        setGitActionToast({
          msg: t('generated.components.layout.useappstate.please_provide_an_http_https_ssh_url_for_example_https_s_834268dc'),
          isError: true,
        });
        return false;
      }

      const targetName = String(targetNameRaw || '').trim();
      return github.cloneRepository(cloneSource, {
        repoName: deriveRepoNameFromCloneSource(cloneSource),
        targetName: targetName || undefined,
      });
    },
    [github, setGitActionToast, t],
  );

  const handleCloneByUrl = useCallback(() => {
    setInputDialog({
      title: t('generated.components.sidebar.repolist.clone_repository_from_url_b2415d88'),
      message: t('generated.components.layout.useappstate.enter_an_http_https_or_ssh_url_and_choose_a_target_direc_4e24ef1b'),
      fields: [
        {
          id: 'cloneSource',
          label: t('generated.components.layout.useappstate.clone_url_449646ea'),
          placeholder: 'https://github.com/owner/repo.git',
          required: true,
          validate: (value) => {
            const normalized = String(value || '').trim();
            if (!normalized) return null;
            if (isCloneSourceLikelyRemote(normalized)) return null;
            return t('generated.components.layout.useappstate.please_provide_an_http_https_ssh_url_for_example_https_o_f3e16379');
          },
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
        const cloned = await cloneFromRemoteSource(values.cloneSource || '', values.targetName || '');
        if (!cloned) return;
        setGitActionToast({
          msg: t('generated.components.layout.useappstate.repository_cloned_successfully_7b3b2cd9'),
          isError: false,
        });
      },
    });
  }, [cloneFromRemoteSource, setGitActionToast, setInputDialog, t]);

  const handleForkByUrl = useCallback(() => {
    if (!githubClient.isAvailable()) return;
    if (!github.isAuthenticated) {
      workspace.setActiveTab('github');
      setGitActionToast({
        msg: t('generated.components.layout.useappstate.please_sign_in_first_in_the_github_tab_d5addce9'),
        isError: true,
      });
      return;
    }

    setInputDialog({
      title: t('generated.components.layout.useappstate.fork_github_repository_1007beda'),
      message: t('generated.components.layout.useappstate.enter_a_github_repository_url_the_fork_will_be_created_a_d4393eec'),
      fields: [
        {
          id: 'sourceUrl',
          label: t('generated.components.layout.useappstate.source_url_7796b5a2'),
          placeholder: 'https://github.com/owner/repo',
          required: true,
          validate: (value) => {
            const normalized = String(value || '').trim();
            if (!normalized) return null;
            return parseGithubRepoReference(normalized)
              ? null
              : t('generated.components.layout.useappstate.please_provide_a_valid_github_url_https_ssh_or_git_host_e46862d3');
          },
        },
        {
          id: 'forkName',
          label: t('generated.components.layout.useappstate.fork_name_optional_0bb173f5'),
          placeholder: t('generated.components.layout.useappstate.default_same_name_beadebe3'),
          required: false,
        },
      ],
      contextItems: [
        {
          label: t('generated.components.layout.useappstate.github_host_fe3a52b8'),
          value: normalizeGitHost(settings.githubHost),
        },
      ],
      irreversible: false,
      consequences: t('generated.components.layout.useappstate.a_fork_will_be_created_in_your_github_account_and_cloned_b2f425e5'),
      confirmLabel: t('generated.components.layout.useappstate.fork_clone_b5d1214a'),
      onSubmit: async (values) => {
        const sourceUrl = String(values.sourceUrl || '').trim();
        const parsed = parseGithubRepoReference(sourceUrl);
        if (!parsed) {
          setGitActionToast({
            msg: t('generated.components.layout.useappstate.invalid_github_url_926331e1'),
            isError: true,
          });
          return;
        }

        const configuredHost = normalizeGitHost(settings.githubHost);
        if (parsed.host !== configuredHost) {
          setGitActionToast({
            msg: tr(`Host passt nicht zum aktiven GitHub-Host (${configuredHost}).`, `Host does not match the active GitHub host (${configuredHost}).`),
            isError: true,
          });
          return;
        }

        const requestedForkName = String(values.forkName || '').trim();
        const forkResult = await githubClient.forkRepository({
          owner: parsed.owner,
          repo: parsed.repo,
          name: requestedForkName || undefined,
        });

        if (!forkResult.success) {
          setGitActionToast({
            msg: forkResult.error || t('generated.components.layout.useappstate.could_not_create_fork_bbfec539'),
            isError: true,
          });
          return;
        }

        setGitActionToast({
          msg: tr(`Fork erstellt: ${forkResult.data.fullName}. Starte Clone...`, `Fork created: ${forkResult.data.fullName}. Starting clone...`),
          isError: false,
        });

        const cloneSuccess = await github.cloneRepository(forkResult.data.cloneUrl, {
          repoName: forkResult.data.name,
        });
        if (!cloneSuccess) {
          setGitActionToast({
            msg: t('generated.components.layout.useappstate.fork_created_but_clone_failed_please_retry_cloning_939a65a0'),
            isError: true,
          });
        }
      },
    });
  }, [github, setGitActionToast, setInputDialog, settings.githubHost, t, tr, workspace]);

  return {
    handleCloneByUrl,
    handleForkByUrl,
  };
};
