import { useCallback, useEffect, type Dispatch, type SetStateAction } from 'react';
import type { GitHubCreateReleaseParamsDto, GitHubReleaseContextDto, GitHubReleaseDto } from '@/global';
import { useLanguageTranslations, type AppLanguage } from '@/i18n';
import { githubClient } from '@/services/githubClient';
import type { ReleaseNotesOptions } from '@/types/releaseNotes';
import type { RepoOwnerRef } from '@/types/git';
import { validateGithubReleaseInput } from '@/utils/githubReleaseValidation';
import { buildAlgorithmicChangeListMarkdown, buildReleaseNotesPromptHints, filterCommitsForReleaseNotes } from '@/utils/releaseNotes';
import { type ReleaseVersionBump, suggestNextReleaseTag } from '@/utils/releaseTagSuggestion';
import type { AppTabId } from '@/components/layout/sidebar/AppSidebar.types';
import type { ConfirmDialogState } from '@/components/layout/layoutTypes';

type Toast = { msg: string; isError: boolean };

type Params = {
  isGithubAuthenticated: boolean;
  ownerRepo: RepoOwnerRef | null;
  currentBranch: string;
  releaseForm: GitHubCreateReleaseParamsDto;
  setReleaseFormState: Dispatch<SetStateAction<GitHubCreateReleaseParamsDto>>;
  releaseContext: GitHubReleaseContextDto | null;
  setReleaseContext: Dispatch<SetStateAction<GitHubReleaseContextDto | null>>;
  setReleaseContextError: Dispatch<SetStateAction<string | null>>;
  setReleaseContextLoading: Dispatch<SetStateAction<boolean>>;
  setReleaseError: Dispatch<SetStateAction<string | null>>;
  setReleaseSuccess: Dispatch<SetStateAction<GitHubReleaseDto | null>>;
  setReleaseSubmitting: Dispatch<SetStateAction<boolean>>;
  showReleaseCreator: boolean;
  setShowReleaseCreator: Dispatch<SetStateAction<boolean>>;
  setReleaseNotesGenerating: Dispatch<SetStateAction<boolean>>;
  releaseNotesLanguage: 'de' | 'en';
  releaseNotesOptions: ReleaseNotesOptions;
  setConfirmDialog: Dispatch<SetStateAction<ConfirmDialogState | null>>;
  setGitActionToast: (toast: Toast) => void;
  setActiveTab: (tab: AppTabId) => void;
  triggerRefresh: () => void;
  language: AppLanguage;
};

export const useReleaseWorkflow = ({
  isGithubAuthenticated,
  ownerRepo,
  currentBranch,
  releaseForm,
  setReleaseFormState,
  releaseContext,
  setReleaseContext,
  setReleaseContextError,
  setReleaseContextLoading,
  setReleaseError,
  setReleaseSuccess,
  setReleaseSubmitting,
  showReleaseCreator,
  setShowReleaseCreator,
  setReleaseNotesGenerating,
  releaseNotesLanguage,
  releaseNotesOptions,
  setConfirmDialog,
  setGitActionToast,
  setActiveTab,
  triggerRefresh,
  language,
}: Params) => {
  const { t, tr } = useLanguageTranslations(language);

  const setReleaseForm = useCallback(
    (updater: (prev: GitHubCreateReleaseParamsDto) => GitHubCreateReleaseParamsDto) => {
      setReleaseFormState((prev) => {
        const next = updater(prev);
        return {
          ...next,
          owner: ownerRepo?.owner || '',
          repo: ownerRepo?.repo || '',
        };
      });
    },
    [ownerRepo, setReleaseFormState],
  );

  const resetReleaseDraft = useCallback(
    (options?: { clearContext?: boolean; clearSuccess?: boolean }) => {
      const clearContext = options?.clearContext ?? false;
      const clearSuccess = options?.clearSuccess ?? false;

      setReleaseFormState({
        owner: ownerRepo?.owner || '',
        repo: ownerRepo?.repo || '',
        tagName: '',
        targetCommitish: currentBranch || '',
        releaseName: '',
        body: '',
        draft: false,
        prerelease: false,
      });
      setReleaseError(null);
      if (clearSuccess) {
        setReleaseSuccess(null);
      }
      if (clearContext) {
        setReleaseContext(null);
        setReleaseContextError(null);
      }
    },
    [currentBranch, ownerRepo?.owner, ownerRepo?.repo, setReleaseContext, setReleaseContextError, setReleaseError, setReleaseFormState, setReleaseSuccess],
  );

  useEffect(() => {
    setReleaseFormState((prev) => ({
      ...prev,
      owner: ownerRepo?.owner || '',
      repo: ownerRepo?.repo || '',
      targetCommitish: prev.targetCommitish || currentBranch,
    }));
  }, [currentBranch, ownerRepo, setReleaseFormState]);

  const refreshReleaseContext = useCallback(
    async (targetCommitishOverride?: string) => {
      if (!githubClient.isAvailable() || !isGithubAuthenticated || !ownerRepo) {
        setReleaseContext(null);
        setReleaseContextError(t('generated.components.layout.workflows.usereleaseworkflow.github_connection_or_repository_mapping_is_missing_58d8b5a1'));
        return;
      }

      setReleaseContextLoading(true);
      setReleaseContextError(null);

      try {
        const targetCommitish = (targetCommitishOverride ?? releaseForm.targetCommitish ?? '').trim() || currentBranch;
        const result = await githubClient.getReleaseContext({
          owner: ownerRepo.owner,
          repo: ownerRepo.repo,
          targetCommitish,
        });

        if (!result.success) {
          setReleaseContext(null);
          setReleaseContextError(result.error || t('generated.components.layout.workflows.usereleaseworkflow.could_not_load_release_context_410f4bdf'));
          return;
        }

        setReleaseContext(result.data);
        const suggestion = suggestNextReleaseTag(result.data.existingTags || []);
        const existingTags = new Set((result.data.existingTags || []).map((tag) => tag.toLowerCase()));

        setReleaseFormState((prev) => {
          const currentTag = (prev.tagName || '').trim();
          const currentTagExists = Boolean(currentTag && existingTags.has(currentTag.toLowerCase()));
          const shouldSuggestTag = !currentTag || currentTagExists;
          if (!shouldSuggestTag) {
            return prev;
          }

          const currentReleaseName = (prev.releaseName || '').trim();
          const shouldSuggestReleaseName = !currentReleaseName || currentReleaseName === `Release ${currentTag}` || currentTagExists;
          return {
            ...prev,
            tagName: suggestion,
            releaseName: shouldSuggestReleaseName ? `Release ${suggestion}` : prev.releaseName,
          };
        });
      } catch (error: any) {
        setReleaseContext(null);
        setReleaseContextError(error?.message || t('generated.components.layout.workflows.usereleaseworkflow.could_not_load_release_context_410f4bdf'));
      } finally {
        setReleaseContextLoading(false);
      }
    },
    [
      currentBranch,
      isGithubAuthenticated,
      ownerRepo,
      releaseForm.targetCommitish,
      setReleaseContext,
      setReleaseContextError,
      setReleaseContextLoading,
      setReleaseFormState,
      t,
    ],
  );

  const handleCreateRelease = useCallback(
    async (confirmedEmptyReleaseNotes = false) => {
      if (!githubClient.isAvailable() || !isGithubAuthenticated || !ownerRepo) {
        setReleaseError(t('generated.components.layout.workflows.usereleaseworkflow.github_connection_or_repository_mapping_is_missing_58d8b5a1'));
        return;
      }

      const validation = validateGithubReleaseInput({
        tagName: releaseForm.tagName,
        releaseName: releaseForm.releaseName,
      });
      const normalizedTag = (releaseForm.tagName || '').trim().toLowerCase();
      const existingTags = new Set((releaseContext?.existingTags || []).map((tag) => tag.toLowerCase()));

      if (!validation.valid) {
        if (validation.errors.tagName === 'release.validation.tagRequired') {
          setReleaseError(t('generated.components.releasecreator.tag_name_must_not_be_empty_370b7b0d'));
          return;
        }
        if (validation.errors.tagName === 'release.validation.tagInvalid') {
          setReleaseError(t('generated.components.releasecreator.tag_name_contains_invalid_characters_or_whitespace_ca817c36'));
          return;
        }
        if (validation.errors.releaseName === 'release.validation.nameRequired') {
          setReleaseError(t('generated.components.layout.sidebar.githubconnectedcontent.release_name_must_not_be_empty_453809c9'));
          return;
        }
        setReleaseError(t('generated.components.releasecreator.release_name_is_too_short_min_3_chars_c39377d1'));
        return;
      }

      if (normalizedTag && existingTags.has(normalizedTag)) {
        setReleaseError(t('generated.components.layout.workflows.usereleaseworkflow.this_tag_already_exists_choose_a_different_tag_d5563f8a'));
        return;
      }

      const releaseNotes = (releaseForm.body || '').trim();
      if (!releaseNotes && !confirmedEmptyReleaseNotes) {
        const releaseMode = releaseForm.draft
          ? t('generated.components.layout.sidebar.repogithubactionscontent.draft_4fc4eecc')
          : t('generated.components.layout.workflows.usereleaseworkflow.published_adbe9c8a');

        setConfirmDialog({
          variant: 'confirm',
          title: releaseForm.draft
            ? t('generated.components.layout.workflows.usereleaseworkflow.create_draft_release_without_notes_248f5d5f')
            : t('generated.components.layout.workflows.usereleaseworkflow.publish_release_without_notes_280a3a1c'),
          message: releaseForm.draft
            ? t('generated.components.layout.workflows.usereleaseworkflow.this_draft_release_has_no_release_notes_do_you_still_wan_6a9f65c2')
            : t('generated.components.layout.workflows.usereleaseworkflow.this_release_has_no_release_notes_do_you_really_want_to_43efa5f1'),
          contextItems: [
            { label: t('generated.components.layout.cloneprogressmodal.repository_3c2e75cb'), value: `${ownerRepo.owner}/${ownerRepo.repo}` },
            { label: t('generated.components.layout.hooks.userepositorydomain.tag_d509084a'), value: releaseForm.tagName.trim() },
            { label: t('generated.components.layout.workflows.usereleaseworkflow.name_605563c5'), value: releaseForm.releaseName.trim() },
            { label: t('generated.components.layout.apimcpsettingspanel.status_b853ab43'), value: releaseMode },
          ],
          irreversible: false,
          consequences: t('generated.components.layout.workflows.usereleaseworkflow.the_github_release_will_be_created_without_a_description_0c5b5547'),
          confirmLabel: releaseForm.draft
            ? t('generated.components.layout.workflows.usereleaseworkflow.create_without_notes_b0c349a2')
            : t('generated.components.layout.workflows.usereleaseworkflow.publish_without_notes_7e45885a'),
          onConfirm: async () => {
            await handleCreateRelease(true);
          },
        });
        return;
      }

      setReleaseSubmitting(true);
      setReleaseError(null);
      setReleaseSuccess(null);

      try {
        const result = await githubClient.createRelease({
          owner: ownerRepo.owner,
          repo: ownerRepo.repo,
          tagName: releaseForm.tagName.trim(),
          targetCommitish: (releaseForm.targetCommitish || '').trim() || currentBranch,
          releaseName: releaseForm.releaseName.trim(),
          body: (releaseForm.body || '').trim(),
          draft: Boolean(releaseForm.draft),
          prerelease: Boolean(releaseForm.prerelease),
        });

        if (!result.success) {
          const errorText = result.error || '';
          const normalized = errorText.toLowerCase();

          if (normalized.includes('tag existiert bereits') || normalized.includes('already_exists')) {
            setReleaseError(t('generated.components.layout.workflows.usereleaseworkflow.this_tag_already_exists_choose_a_different_tag_or_use_th_31f19d6a'));
            return;
          }

          if (normalized.includes('berechtigung') || normalized.includes('permission') || normalized.includes('forbidden')) {
            setReleaseError(t('generated.components.layout.workflows.usereleaseworkflow.missing_repository_permission_check_token_scopes_and_rep_695cc307'));
            return;
          }

          if (normalized.includes('targetcommitish') || normalized.includes('target_commitish')) {
            setReleaseError(t('generated.components.layout.workflows.usereleaseworkflow.target_branch_commit_is_invalid_please_verify_branch_or_0f08d8ef'));
            return;
          }

          setReleaseError(errorText || t('generated.components.layout.workflows.usereleaseworkflow.could_not_create_release_7ed5aef0'));
          return;
        }

        setReleaseSuccess(result.data);
        setGitActionToast({
          msg: tr(`Release ${result.data.tagName} erstellt.`, `Release ${result.data.tagName} created.`),
          isError: false,
        });
        triggerRefresh();
        resetReleaseDraft({ clearContext: true, clearSuccess: false });
        await refreshReleaseContext(currentBranch || undefined);
      } catch (error: any) {
        setReleaseError(error?.message || t('generated.components.layout.workflows.usereleaseworkflow.could_not_create_release_7ed5aef0'));
      } finally {
        setReleaseSubmitting(false);
      }
    },
    [
      currentBranch,
      isGithubAuthenticated,
      ownerRepo,
      refreshReleaseContext,
      releaseContext?.existingTags,
      releaseForm.body,
      releaseForm.draft,
      releaseForm.prerelease,
      releaseForm.releaseName,
      releaseForm.tagName,
      releaseForm.targetCommitish,
      resetReleaseDraft,
      setConfirmDialog,
      setGitActionToast,
      setReleaseError,
      setReleaseSubmitting,
      setReleaseSuccess,
      t,
      tr,
      triggerRefresh,
    ],
  );

  const generateReleaseNotesWithAI = useCallback(
    async (versionBump: ReleaseVersionBump) => {
      if (!githubClient.isAvailable()) return;
      if (!isGithubAuthenticated || !ownerRepo) {
        setReleaseError(t('generated.components.layout.workflows.usereleaseworkflow.github_connection_or_repository_mapping_is_missing_58d8b5a1'));
        return;
      }

      const sourceCommits = releaseContext?.commitsSinceLastRelease || [];
      if (sourceCommits.length === 0) {
        setReleaseError(t('generated.components.layout.workflows.usereleaseworkflow.no_commit_base_for_ai_generation_available_9a0535af'));
        return;
      }
      const commits = filterCommitsForReleaseNotes(sourceCommits, releaseNotesOptions);
      const promptHints = buildReleaseNotesPromptHints(releaseNotesOptions, releaseNotesLanguage);

      const tagName = (releaseForm.tagName || '').trim();
      const releaseName = (releaseForm.releaseName || '').trim() || `Release ${tagName || 'next'}`;
      if (!tagName) {
        setReleaseError(t('generated.components.layout.workflows.usereleaseworkflow.please_set_a_tag_name_first_9512c3ad'));
        return;
      }

      setReleaseNotesGenerating(true);
      setReleaseError(null);

      try {
        const result = await githubClient.generateReleaseNotes({
          tagName,
          releaseName,
          lastReleaseTag: releaseContext?.lastReleaseTag || null,
          commits,
          repositoryHtmlUrl: releaseContext?.repositoryHtmlUrl || null,
          language: releaseNotesLanguage,
          versionBump,
          hints: promptHints,
        });

        if (!result.success) {
          setReleaseError(result.error || t('generated.components.layout.workflows.usereleaseworkflow.could_not_generate_ai_release_notes_0402ba88'));
          return;
        }

        let markdown = result.data.markdown || '';
        if (releaseNotesOptions.appendAlgorithmicChangeList) {
          const automaticList = buildAlgorithmicChangeListMarkdown(commits, releaseNotesLanguage, releaseNotesOptions.includeHashesInAlgorithmicList);
          if (automaticList) {
            markdown = `${markdown.trim()}\n\n${automaticList}`.trim();
          }
        }

        setReleaseFormState((prev) => ({
          ...prev,
          releaseName: prev.releaseName || releaseName,
          body: markdown,
        }));
        setGitActionToast({ msg: t('generated.components.layout.workflows.usereleaseworkflow.ai_release_notes_generated_c784fbf3'), isError: false });
      } catch (error: any) {
        setReleaseError(error?.message || t('generated.components.layout.workflows.usereleaseworkflow.could_not_generate_ai_release_notes_0402ba88'));
      } finally {
        setReleaseNotesGenerating(false);
      }
    },
    [
      isGithubAuthenticated,
      ownerRepo,
      releaseContext?.commitsSinceLastRelease,
      releaseContext?.lastReleaseTag,
      releaseContext?.repositoryHtmlUrl,
      releaseNotesOptions,
      releaseNotesLanguage,
      releaseForm.tagName,
      releaseForm.releaseName,
      setReleaseNotesGenerating,
      setReleaseError,
      t,
      setReleaseFormState,
      setGitActionToast,
    ],
  );

  const openReleaseCreator = useCallback(() => {
    setActiveTab('repo');
    resetReleaseDraft({ clearContext: true, clearSuccess: true });
    setShowReleaseCreator(true);
  }, [resetReleaseDraft, setActiveTab, setShowReleaseCreator]);

  const closeReleaseCreator = useCallback(() => {
    setShowReleaseCreator(false);
  }, [setShowReleaseCreator]);

  useEffect(() => {
    if (!showReleaseCreator) return;
    void refreshReleaseContext();
  }, [showReleaseCreator, refreshReleaseContext]);

  return {
    closeReleaseCreator,
    generateReleaseNotesWithAI,
    handleCreateRelease,
    openReleaseCreator,
    refreshReleaseContext,
    resetReleaseDraft,
    setReleaseForm,
  };
};
