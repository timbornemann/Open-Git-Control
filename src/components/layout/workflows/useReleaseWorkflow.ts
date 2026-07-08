import { useCallback, useEffect, type Dispatch, type SetStateAction } from 'react';
import type {
  GitHubCreateReleaseParamsDto,
  GitHubReleaseContextDto,
  GitHubReleaseDto,
} from '../../../global';
import { trByLanguage, type AppLanguage } from '../../../i18n';
import type { ReleaseNotesOptions } from '../../../types/releaseNotes';
import type { RepoOwnerRef } from '../../../types/git';
import { validateGithubReleaseInput } from '../../../utils/githubReleaseValidation';
import {
  buildAlgorithmicChangeListMarkdown,
  buildReleaseNotesPromptHints,
  filterCommitsForReleaseNotes,
} from '../../../utils/releaseNotes';
import {
  type ReleaseVersionBump,
  suggestNextReleaseTag,
} from '../../../utils/releaseTagSuggestion';
import type { AppTabId } from '../sidebar/AppSidebar.types';
import type { ConfirmDialogState } from '../layoutTypes';

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
  const tr = useCallback((deText: string, enText: string) => {
    return trByLanguage(language, deText, enText);
  }, [language]);

  const setReleaseForm = useCallback((updater: (prev: GitHubCreateReleaseParamsDto) => GitHubCreateReleaseParamsDto) => {
    setReleaseFormState(prev => {
      const next = updater(prev);
      return {
        ...next,
        owner: ownerRepo?.owner || '',
        repo: ownerRepo?.repo || '',
      };
    });
  }, [ownerRepo, setReleaseFormState]);

  const resetReleaseDraft = useCallback((options?: { clearContext?: boolean; clearSuccess?: boolean }) => {
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
  }, [
    currentBranch,
    ownerRepo?.owner,
    ownerRepo?.repo,
    setReleaseContext,
    setReleaseContextError,
    setReleaseError,
    setReleaseFormState,
    setReleaseSuccess,
  ]);

  useEffect(() => {
    setReleaseFormState(prev => ({
      ...prev,
      owner: ownerRepo?.owner || '',
      repo: ownerRepo?.repo || '',
      targetCommitish: prev.targetCommitish || currentBranch,
    }));
  }, [currentBranch, ownerRepo, setReleaseFormState]);

  const refreshReleaseContext = useCallback(async (targetCommitishOverride?: string) => {
    if (!window.electronAPI || !isGithubAuthenticated || !ownerRepo) {
      setReleaseContext(null);
      setReleaseContextError(tr('GitHub-Verbindung oder Repository-Zuordnung fehlt.', 'GitHub connection or repository mapping is missing.'));
      return;
    }

    setReleaseContextLoading(true);
    setReleaseContextError(null);

    try {
      const targetCommitish = (targetCommitishOverride ?? releaseForm.targetCommitish ?? '').trim() || currentBranch;
      const result = await window.electronAPI.githubGetReleaseContext({
        owner: ownerRepo.owner,
        repo: ownerRepo.repo,
        targetCommitish,
      });

      if (!result.success) {
        setReleaseContext(null);
        setReleaseContextError(result.error || tr('Release-Kontext konnte nicht geladen werden.', 'Could not load release context.'));
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
        const shouldSuggestReleaseName = (
          !currentReleaseName
          || currentReleaseName === `Release ${currentTag}`
          || currentTagExists
        );
        return {
          ...prev,
          tagName: suggestion,
          releaseName: shouldSuggestReleaseName ? `Release ${suggestion}` : prev.releaseName,
        };
      });
    } catch (error: any) {
      setReleaseContext(null);
      setReleaseContextError(error?.message || tr('Release-Kontext konnte nicht geladen werden.', 'Could not load release context.'));
    } finally {
      setReleaseContextLoading(false);
    }
  }, [
    currentBranch,
    isGithubAuthenticated,
    ownerRepo,
    releaseForm.targetCommitish,
    setReleaseContext,
    setReleaseContextError,
    setReleaseContextLoading,
    setReleaseFormState,
    tr,
  ]);

  const handleCreateRelease = useCallback(async (confirmedEmptyReleaseNotes = false) => {
    if (!window.electronAPI || !isGithubAuthenticated || !ownerRepo) {
      setReleaseError(tr('GitHub-Verbindung oder Repository-Zuordnung fehlt.', 'GitHub connection or repository mapping is missing.'));
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
        setReleaseError(tr('Tag-Name darf nicht leer sein.', 'Tag name must not be empty.'));
        return;
      }
      if (validation.errors.tagName === 'release.validation.tagInvalid') {
        setReleaseError(tr('Tag-Name enthaelt ungueltige Zeichen oder Leerzeichen.', 'Tag name contains invalid characters or whitespace.'));
        return;
      }
      if (validation.errors.releaseName === 'release.validation.nameRequired') {
        setReleaseError(tr('Release-Name darf nicht leer sein.', 'Release name must not be empty.'));
        return;
      }
      setReleaseError(tr('Release-Name ist zu kurz (mind. 3 Zeichen).', 'Release name is too short (min. 3 chars).'));
      return;
    }

    if (normalizedTag && existingTags.has(normalizedTag)) {
      setReleaseError(tr('Dieser Tag existiert bereits. Waehle einen anderen Tag.', 'This tag already exists. Choose a different tag.'));
      return;
    }

    const releaseNotes = (releaseForm.body || '').trim();
    if (!releaseNotes && !confirmedEmptyReleaseNotes) {
      const releaseMode = releaseForm.draft
        ? tr('Entwurf', 'Draft')
        : tr('Veroeffentlicht', 'Published');

      setConfirmDialog({
        variant: 'confirm',
        title: releaseForm.draft
          ? tr('Release-Entwurf ohne Notes erstellen?', 'Create draft release without notes?')
          : tr('Release ohne Notes veroeffentlichen?', 'Publish release without notes?'),
        message: releaseForm.draft
          ? tr('Der Release-Entwurf enthaelt keine Release Notes. Moechtest du ihn trotzdem erstellen?', 'This draft release has no release notes. Do you still want to create it?')
          : tr('Dieser Release enthaelt keine Release Notes. Moechtest du ihn wirklich veroeffentlichen?', 'This release has no release notes. Do you really want to publish it?'),
        contextItems: [
          { label: tr('Repository', 'Repository'), value: `${ownerRepo.owner}/${ownerRepo.repo}` },
          { label: tr('Tag', 'Tag'), value: releaseForm.tagName.trim() },
          { label: tr('Name', 'Name'), value: releaseForm.releaseName.trim() },
          { label: tr('Status', 'Status'), value: releaseMode },
        ],
        irreversible: false,
        consequences: tr(
          'Der GitHub-Release wird ohne Beschreibung angelegt. Du kannst die Notes spaeter auf GitHub nachtragen.',
          'The GitHub release will be created without a description. You can add notes later on GitHub.',
        ),
        confirmLabel: releaseForm.draft
          ? tr('Ohne Notes erstellen', 'Create without notes')
          : tr('Ohne Notes veroeffentlichen', 'Publish without notes'),
        onConfirm: async () => { await handleCreateRelease(true); },
      });
      return;
    }

    setReleaseSubmitting(true);
    setReleaseError(null);
    setReleaseSuccess(null);

    try {
      const result = await window.electronAPI.githubCreateRelease({
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
          setReleaseError(tr('Dieser Tag existiert bereits. Waehle einen anderen Tag oder verwende den bestehenden Tag.', 'This tag already exists. Choose a different tag or use the existing tag.'));
          return;
        }

        if (normalized.includes('berechtigung') || normalized.includes('permission') || normalized.includes('forbidden')) {
          setReleaseError(tr('Fehlende Berechtigung fuer das Repository. Pruefe Token-Scopes und Repo-Zugriff.', 'Missing repository permission. Check token scopes and repo access.'));
          return;
        }

        if (normalized.includes('targetcommitish') || normalized.includes('target_commitish')) {
          setReleaseError(tr('Ziel-Branch/Ziel-Commit ist ungueltig. Bitte Branch oder SHA pruefen.', 'Target branch/commit is invalid. Please verify branch or SHA.'));
          return;
        }

        setReleaseError(errorText || tr('Release konnte nicht erstellt werden.', 'Could not create release.'));
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
      setReleaseError(error?.message || tr('Release konnte nicht erstellt werden.', 'Could not create release.'));
    } finally {
      setReleaseSubmitting(false);
    }
  }, [
    currentBranch,
    isGithubAuthenticated,
    ownerRepo,
    refreshReleaseContext,
    releaseContext?.existingTags,
    releaseForm,
    resetReleaseDraft,
    setConfirmDialog,
    setGitActionToast,
    setReleaseError,
    setReleaseSubmitting,
    setReleaseSuccess,
    tr,
    triggerRefresh,
  ]);

  const generateReleaseNotesWithAI = useCallback(async (versionBump: ReleaseVersionBump) => {
    if (!window.electronAPI) return;
    if (!isGithubAuthenticated || !ownerRepo) {
      setReleaseError(tr('GitHub-Verbindung oder Repository-Zuordnung fehlt.', 'GitHub connection or repository mapping is missing.'));
      return;
    }

    const sourceCommits = releaseContext?.commitsSinceLastRelease || [];
    if (sourceCommits.length === 0) {
      setReleaseError(tr('Keine Commit-Basis fuer KI vorhanden.', 'No commit base for AI generation available.'));
      return;
    }
    const commits = filterCommitsForReleaseNotes(sourceCommits, releaseNotesOptions);
    const promptHints = buildReleaseNotesPromptHints(releaseNotesOptions, releaseNotesLanguage);

    const tagName = (releaseForm.tagName || '').trim();
    const releaseName = (releaseForm.releaseName || '').trim() || `Release ${tagName || 'next'}`;
    if (!tagName) {
      setReleaseError(tr('Bitte zuerst einen Tag-Namen setzen.', 'Please set a tag name first.'));
      return;
    }

    setReleaseNotesGenerating(true);
    setReleaseError(null);

    try {
      const result = await window.electronAPI.aiGenerateReleaseNotes({
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
        setReleaseError(result.error || tr('KI Release Notes konnten nicht erstellt werden.', 'Could not generate AI release notes.'));
        return;
      }

      let markdown = result.data.markdown || '';
      if (releaseNotesOptions.appendAlgorithmicChangeList) {
        const automaticList = buildAlgorithmicChangeListMarkdown(
          commits,
          releaseNotesLanguage,
          releaseNotesOptions.includeHashesInAlgorithmicList,
        );
        if (automaticList) {
          markdown = `${markdown.trim()}\n\n${automaticList}`.trim();
        }
      }

      setReleaseFormState((prev) => ({
        ...prev,
        releaseName: prev.releaseName || releaseName,
        body: markdown,
      }));
      setGitActionToast({ msg: tr('Release Notes mit KI erstellt.', 'AI release notes generated.'), isError: false });
    } catch (error: any) {
      setReleaseError(error?.message || tr('KI Release Notes konnten nicht erstellt werden.', 'Could not generate AI release notes.'));
    } finally {
      setReleaseNotesGenerating(false);
    }
  }, [
    isGithubAuthenticated,
    ownerRepo,
    releaseContext,
    releaseForm.tagName,
    releaseForm.releaseName,
    releaseNotesLanguage,
    releaseNotesOptions,
    setGitActionToast,
    setReleaseError,
    setReleaseFormState,
    setReleaseNotesGenerating,
    tr,
  ]);

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
