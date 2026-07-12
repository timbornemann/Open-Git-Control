import { useCallback, useEffect, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { GitHubCreateReleaseParamsDto, GitHubReleaseContextDto, GitHubReleaseDto } from '@/types/githubDtos';
import { useLanguageTranslations, type AppLanguage } from '@/i18n';
import { appClient } from '@/services/appClient';
import { gitClient } from '@/services/gitClient';
import { githubClient } from '@/services/githubClient';
import type { ReleaseNotesOptions } from '@/types/releaseNotes';
import type { RepoOwnerRef } from '@/types/git';
import { validateGithubReleaseInput } from '@/utils/githubReleaseValidation';
import { buildAlgorithmicChangeListMarkdown, buildReleaseNotesPromptHints, filterCommitsForReleaseNotes } from '@/utils/releaseNotes';
import { type ReleaseVersionBump, suggestNextReleaseTag } from '@/utils/releaseTagSuggestion';
import type { AppTabId } from '@/app/state/contracts';
import { requestWorkingDirectoryNavigation } from '@/components/working-directory/workingDirectoryNavigationGuard';
import type { ConfirmDialogState } from '@/components/layout/layoutTypes';
import { getCreateReleaseErrorMessage, getReleaseAssetErrorMessage, getReleaseValidationErrorMessage } from './releaseWorkflowMessages';

type Toast = { msg: string; isError: boolean };

type ReleaseSubmissionSnapshot = {
  generation: number;
  repoPath: string;
  createParams: GitHubCreateReleaseParamsDto;
  pendingAssets: string[];
  fingerprint: string;
};

const buildReleaseCreateParams = (
  form: GitHubCreateReleaseParamsDto,
  ownerRepo: RepoOwnerRef,
  currentBranch: string,
  repoPath: string,
): GitHubCreateReleaseParamsDto => ({
  owner: ownerRepo.owner,
  repo: ownerRepo.repo,
  repoPath,
  tagName: (form.tagName || '').trim(),
  targetCommitish: (form.targetCommitish || '').trim() || currentBranch,
  releaseName: (form.releaseName || '').trim(),
  body: (form.body || '').trim(),
  draft: Boolean(form.draft),
  prerelease: Boolean(form.prerelease),
});

const getReleaseSubmissionFingerprint = (params: GitHubCreateReleaseParamsDto, pendingAssets: readonly string[]): string =>
  JSON.stringify({ params, pendingAssets });

type Params = {
  activeRepo: string | null;
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
  releaseNotesGenerating: boolean;
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
  activeRepo,
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
  releaseNotesGenerating,
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
  const generationRef = useRef(0);
  const activeRepoRef = useRef<string | null>(activeRepo);
  const ownerRepoRef = useRef<RepoOwnerRef | null>(ownerRepo);
  const currentBranchRef = useRef(currentBranch);
  const releaseFormRef = useRef(releaseForm);
  const releasePendingAssetsRef = useRef<string[]>([]);
  // Distinguishes successive refreshReleaseContext calls (e.g. while typing
  // targetCommitish) within one repo/branch generation, so a slower earlier
  // request cannot overwrite the context produced by a newer one.
  const refreshContextRequestRef = useRef(0);
  const releaseNotesGeneratingRef = useRef(releaseNotesGenerating);
  const releaseContextLoadingRef = useRef(false);
  const [releasePendingAssets, setReleasePendingAssets] = useState<string[]>([]);

  useLayoutEffect(() => {
    releaseNotesGeneratingRef.current = releaseNotesGenerating;
  }, [releaseNotesGenerating]);

  useLayoutEffect(() => {
    ownerRepoRef.current = ownerRepo;
    currentBranchRef.current = currentBranch;
    releaseFormRef.current = releaseForm;
    releasePendingAssetsRef.current = releasePendingAssets;
  }, [currentBranch, ownerRepo, releaseForm, releasePendingAssets]);

  useLayoutEffect(() => {
    activeRepoRef.current = activeRepo;
    generationRef.current += 1;
    refreshContextRequestRef.current += 1;
    releaseNotesGeneratingRef.current = false;
    releaseContextLoadingRef.current = false;
    setReleaseContextLoading(false);
    setReleaseNotesGenerating(false);
    setReleaseSubmitting(false);
    setReleasePendingAssets([]);
    setConfirmDialog(null);
  }, [
    activeRepo,
    currentBranch,
    ownerRepo?.owner,
    ownerRepo?.repo,
    setConfirmDialog,
    setReleaseContextLoading,
    setReleaseNotesGenerating,
    setReleaseSubmitting,
  ]);

  const isCurrentGeneration = useCallback((generation: number, repoPath: string | null) => {
    return generation === generationRef.current && activeRepoRef.current === repoPath;
  }, []);

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
      setReleasePendingAssets([]);
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
      if (releaseNotesGeneratingRef.current) return;
      if (!githubClient.isAvailable() || !isGithubAuthenticated || !ownerRepo) {
        refreshContextRequestRef.current += 1;
        releaseContextLoadingRef.current = false;
        setReleaseContextLoading(false);
        setReleaseContext(null);
        setReleaseContextError(t('generated.components.layout.workflows.usereleaseworkflow.github_connection_or_repository_mapping_is_missing_58d8b5a1'));
        return;
      }

      releaseContextLoadingRef.current = true;
      setReleaseContextLoading(true);
      setReleaseContextError(null);
      const generation = generationRef.current;
      const repoPath = activeRepoRef.current;
      const requestId = ++refreshContextRequestRef.current;
      const isCurrentRefresh = () => isCurrentGeneration(generation, repoPath) && refreshContextRequestRef.current === requestId;

      try {
        const targetCommitish = (targetCommitishOverride ?? releaseForm.targetCommitish ?? '').trim() || currentBranch;
        const result = await githubClient.getReleaseContext({
          owner: ownerRepo.owner,
          repo: ownerRepo.repo,
          targetCommitish,
          repoPath: repoPath || undefined,
        });
        if (!isCurrentRefresh()) return;

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
        if (!isCurrentRefresh()) return;
        setReleaseContext(null);
        setReleaseContextError(error?.message || t('generated.components.layout.workflows.usereleaseworkflow.could_not_load_release_context_410f4bdf'));
      } finally {
        if (isCurrentRefresh()) {
          releaseContextLoadingRef.current = false;
          setReleaseContextLoading(false);
        }
      }
    },
    [
      isCurrentGeneration,
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
    async (confirmedEmptyReleaseNotes = false, confirmedSnapshot?: ReleaseSubmissionSnapshot) => {
      if (confirmedSnapshot) {
        const currentOwnerRepo = ownerRepoRef.current;
        const currentRepoPath = activeRepoRef.current;
        const currentParams =
          currentOwnerRepo && currentRepoPath
            ? buildReleaseCreateParams(releaseFormRef.current, currentOwnerRepo, currentBranchRef.current, currentRepoPath)
            : null;
        const currentFingerprint = currentParams ? getReleaseSubmissionFingerprint(currentParams, releasePendingAssetsRef.current) : null;
        if (!isCurrentGeneration(confirmedSnapshot.generation, confirmedSnapshot.repoPath) || currentFingerprint !== confirmedSnapshot.fingerprint) {
          setConfirmDialog(null);
          return;
        }
      }

      if (!githubClient.isAvailable() || !isGithubAuthenticated || !ownerRepo) {
        setReleaseError(t('generated.components.layout.workflows.usereleaseworkflow.github_connection_or_repository_mapping_is_missing_58d8b5a1'));
        return;
      }

      if (releaseNotesGeneratingRef.current) {
        setReleaseError(tr('Bitte warte, bis die Release-Notes-Generierung abgeschlossen ist.', 'Please wait until release-note generation has finished.'));
        return;
      }

      const repoPath = confirmedSnapshot?.repoPath || activeRepoRef.current;
      if (!repoPath) {
        setReleaseError(tr('Das zugehoerige Repository ist nicht mehr aktiv.', 'The associated repository is no longer active.'));
        return;
      }
      const createParams = confirmedSnapshot?.createParams || buildReleaseCreateParams(releaseForm, ownerRepo, currentBranch, repoPath);
      const validation = validateGithubReleaseInput({
        tagName: createParams.tagName,
        releaseName: createParams.releaseName,
      });
      const normalizedTag = (createParams.tagName || '').trim().toLowerCase();
      const existingTags = new Set((releaseContext?.existingTags || []).map((tag) => tag.toLowerCase()));
      const validationError = getReleaseValidationErrorMessage(validation, t);

      if (validationError) {
        setReleaseError(validationError);
        return;
      }

      if (normalizedTag && existingTags.has(normalizedTag)) {
        setReleaseError(t('generated.components.layout.workflows.usereleaseworkflow.this_tag_already_exists_choose_a_different_tag_d5563f8a'));
        return;
      }

      const showEmptyReleaseNotesConfirm = (snapshot: ReleaseSubmissionSnapshot) => {
        const releaseMode = createParams.draft
          ? t('generated.components.layout.sidebar.repogithubactionscontent.draft_4fc4eecc')
          : t('generated.components.layout.workflows.usereleaseworkflow.published_adbe9c8a');

        setConfirmDialog({
          variant: 'confirm',
          title: createParams.draft
            ? t('generated.components.layout.workflows.usereleaseworkflow.create_draft_release_without_notes_248f5d5f')
            : t('generated.components.layout.workflows.usereleaseworkflow.publish_release_without_notes_280a3a1c'),
          message: createParams.draft
            ? t('generated.components.layout.workflows.usereleaseworkflow.this_draft_release_has_no_release_notes_do_you_still_wan_6a9f65c2')
            : t('generated.components.layout.workflows.usereleaseworkflow.this_release_has_no_release_notes_do_you_really_want_to_43efa5f1'),
          contextItems: [
            { label: t('generated.components.layout.cloneprogressmodal.repository_3c2e75cb'), value: `${createParams.owner}/${createParams.repo}` },
            { label: t('generated.components.layout.hooks.userepositorydomain.tag_d509084a'), value: createParams.tagName.trim() },
            { label: t('generated.components.layout.workflows.usereleaseworkflow.name_605563c5'), value: createParams.releaseName.trim() },
            { label: t('generated.components.layout.apimcpsettingspanel.status_b853ab43'), value: releaseMode },
          ],
          irreversible: false,
          consequences: t('generated.components.layout.workflows.usereleaseworkflow.the_github_release_will_be_created_without_a_description_0c5b5547'),
          confirmLabel: createParams.draft
            ? t('generated.components.layout.workflows.usereleaseworkflow.create_without_notes_b0c349a2')
            : t('generated.components.layout.workflows.usereleaseworkflow.publish_without_notes_7e45885a'),
          onConfirm: async () => {
            await handleCreateRelease(true, snapshot);
          },
        });
      };

      const releaseNotes = (createParams.body || '').trim();
      if (!releaseNotes && !confirmedEmptyReleaseNotes) {
        const snapshot: ReleaseSubmissionSnapshot = {
          generation: generationRef.current,
          repoPath,
          createParams,
          pendingAssets: [...releasePendingAssets],
          fingerprint: getReleaseSubmissionFingerprint(createParams, releasePendingAssets),
        };
        showEmptyReleaseNotesConfirm(snapshot);
        return;
      }

      setReleaseSubmitting(true);
      setReleaseError(null);
      setReleaseSuccess(null);
      const generation = confirmedSnapshot?.generation ?? generationRef.current;
      const pendingAssets = confirmedSnapshot?.pendingAssets || [...releasePendingAssets];

      // Uploads every pending asset to the created release. Returns false when
      // the repository switched mid-upload or an upload failed (both cases stop
      // the success path without overwriting the error already surfaced here).
      const uploadPendingAssets = async (releaseData: GitHubReleaseDto): Promise<boolean> => {
        for (const filePath of pendingAssets) {
          const uploadResult = await githubClient.uploadReleaseAsset({
            owner: createParams.owner,
            repo: createParams.repo,
            repoPath,
            releaseId: releaseData.id,
            filePath,
          });
          if (!isCurrentGeneration(generation, repoPath)) return false;
          if (!uploadResult.success) {
            setReleaseError(getReleaseAssetErrorMessage(uploadResult.error || '', tr));
            setReleaseSuccess(releaseData);
            return false;
          }
        }
        return true;
      };

      const performReleaseCreation = async (): Promise<void> => {
        if (!repoPath || !gitClient.isAvailable()) {
          throw new Error(tr('Das zugehoerige Repository ist nicht mehr aktiv.', 'The associated repository is no longer active.'));
        }
        // GitHub writes do not inherently carry a local repository path. Use a
        // cheap main-process authorization barrier immediately before the
        // irreversible request so a confirmation from repo A cannot publish a
        // release after a concurrent switch has already activated repo B.
        const authorization = await gitClient.getRepoOriginUrl(repoPath);
        if (!isCurrentGeneration(generation, repoPath)) return;
        if (!authorization.success) {
          throw new Error(authorization.error || tr('Das zugehoerige Repository ist nicht mehr aktiv.', 'The associated repository is no longer active.'));
        }

        const result = await githubClient.createRelease(createParams);
        if (!isCurrentGeneration(generation, repoPath)) return;

        if (!result.success) {
          setReleaseError(getCreateReleaseErrorMessage(result.error || '', t));
          return;
        }

        if (!(await uploadPendingAssets(result.data))) return;

        setReleaseSuccess(result.data);
        setGitActionToast({
          msg: tr(`Release ${result.data.tagName} erstellt.`, `Release ${result.data.tagName} created.`),
          isError: false,
        });
        triggerRefresh();
        resetReleaseDraft({ clearContext: true, clearSuccess: false });
        await refreshReleaseContext(currentBranch || undefined);
      };

      try {
        await performReleaseCreation();
      } catch (error: any) {
        if (!isCurrentGeneration(generation, repoPath)) return;
        setReleaseError(error?.message || t('generated.components.layout.workflows.usereleaseworkflow.could_not_create_release_7ed5aef0'));
      } finally {
        if (isCurrentGeneration(generation, repoPath)) {
          setReleaseSubmitting(false);
        }
      }
    },
    [
      isCurrentGeneration,
      currentBranch,
      isGithubAuthenticated,
      ownerRepo,
      refreshReleaseContext,
      releaseContext?.existingTags,
      releaseForm,
      releasePendingAssets,
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
      if (releaseContextLoadingRef.current) {
        setReleaseError(tr('Bitte warte, bis der Release-Kontext aktualisiert wurde.', 'Please wait until the release context has refreshed.'));
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
      const effectiveTarget = (releaseForm.targetCommitish || '').trim() || currentBranch;
      if (!releaseContext || releaseContext.commitsTarget !== effectiveTarget) {
        setReleaseError(
          tr(
            'Der Release-Kontext passt nicht mehr zum Ziel. Bitte aktualisiere ihn zuerst.',
            'The release context no longer matches the target. Refresh it first.',
          ),
        );
        return;
      }

      setReleaseNotesGenerating(true);
      releaseNotesGeneratingRef.current = true;
      setConfirmDialog(null);
      setReleaseError(null);
      const generation = generationRef.current;
      const repoPath = activeRepoRef.current;

      const runGeneration = async (): Promise<void> => {
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
        if (!isCurrentGeneration(generation, repoPath)) return;

        if (!result.success) {
          setReleaseError(result.error || t('generated.components.layout.workflows.usereleaseworkflow.could_not_generate_ai_release_notes_0402ba88'));
          return;
        }

        if (!repoPath || !gitClient.isAvailable()) return;
        const authorization = await gitClient.getRepoOriginUrl(repoPath);
        if (!isCurrentGeneration(generation, repoPath)) return;
        if (!authorization.success) {
          setReleaseError(authorization.error || tr('Das zugehoerige Repository ist nicht mehr aktiv.', 'The associated repository is no longer active.'));
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
        // Only an explicit backend AI provenance may show the AI-success toast.
        // Missing/legacy metadata is treated conservatively as fallback.
        const usedFallback = result.data.source !== 'ai';
        setGitActionToast({
          msg: usedFallback
            ? result.data.warning ||
              tr('KI nicht verfuegbar; deterministische Release Notes wurden erstellt.', 'AI unavailable; deterministic release notes were generated.')
            : t('generated.components.layout.workflows.usereleaseworkflow.ai_release_notes_generated_c784fbf3'),
          isError: usedFallback,
        });
      };

      try {
        await runGeneration();
      } catch (error: any) {
        if (!isCurrentGeneration(generation, repoPath)) return;
        setReleaseError(error?.message || t('generated.components.layout.workflows.usereleaseworkflow.could_not_generate_ai_release_notes_0402ba88'));
      } finally {
        if (isCurrentGeneration(generation, repoPath)) {
          releaseNotesGeneratingRef.current = false;
          setReleaseNotesGenerating(false);
        }
      }
    },
    [
      isCurrentGeneration,
      isGithubAuthenticated,
      currentBranch,
      ownerRepo,
      releaseContext,
      releaseNotesOptions,
      releaseNotesLanguage,
      releaseForm.tagName,
      releaseForm.releaseName,
      releaseForm.targetCommitish,
      setReleaseNotesGenerating,
      setConfirmDialog,
      setReleaseError,
      t,
      setReleaseFormState,
      setGitActionToast,
      tr,
    ],
  );

  const addReleasePendingAssets = useCallback(async () => {
    if (!appClient.isAvailable()) return;
    const generation = generationRef.current;
    const repoPath = activeRepoRef.current;
    const selected = await appClient.selectFiles();
    if (!isCurrentGeneration(generation, repoPath) || !selected || selected.length === 0) return;
    setReleasePendingAssets((prev) => [...new Set([...prev, ...selected])]);
  }, [isCurrentGeneration]);

  const removeReleasePendingAsset = useCallback((filePath: string) => {
    setReleasePendingAssets((prev) => prev.filter((path) => path !== filePath));
  }, []);

  const openReleaseCreator = useCallback(() => {
    requestWorkingDirectoryNavigation({ kind: 'view', label: 'release' }, () => {
      setActiveTab('repo');
      setReleaseSubmitting(false);
      resetReleaseDraft({ clearContext: true, clearSuccess: true });
      setShowReleaseCreator(true);
    });
  }, [resetReleaseDraft, setActiveTab, setReleaseSubmitting, setShowReleaseCreator]);

  const closeReleaseCreator = useCallback(() => {
    generationRef.current += 1;
    refreshContextRequestRef.current += 1;
    releaseNotesGeneratingRef.current = false;
    releaseContextLoadingRef.current = false;
    setReleaseContextLoading(false);
    setReleaseNotesGenerating(false);
    setReleaseSubmitting(false);
    setShowReleaseCreator(false);
  }, [setReleaseContextLoading, setReleaseNotesGenerating, setReleaseSubmitting, setShowReleaseCreator]);

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
    releasePendingAssets,
    addReleasePendingAssets,
    removeReleasePendingAsset,
  };
};
