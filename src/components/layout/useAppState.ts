import { useCallback, useEffect, useRef, useState } from 'react';
import { AppSettingsDto, GitHubCreateReleaseParamsDto, GitHubReleaseContextDto, GitHubReleaseDto, GitJobEventDto } from '../../global';
import { useToastQueue } from '../../hooks/useToastQueue';
import { trByLanguage } from '../../i18n';
import { useDialogControllers } from './hooks/useDialogControllers';
import { useWorkspaceDomain } from './hooks/useWorkspaceDomain';
import { useRepositoryDomain } from './hooks/useRepositoryDomain';
import { useGithubDomain } from './hooks/useGithubDomain';
import { usePullRequests } from '../../hooks/usePullRequests';
import { validateGithubReleaseInput } from '../../utils/githubReleaseValidation';
import { suggestNextReleaseTag } from '../../utils/releaseTagSuggestion';

const DEFAULT_SETTINGS: AppSettingsDto = {
  theme: 'copper-night',
  language: 'de',
  autoFetchIntervalMs: 60_000,
  defaultBranch: 'main',
  confirmDangerousOps: true,
  commitTemplate: '',
  showSecondaryHistory: true,
  commitSignoffByDefault: false,
  secretScanBeforePushEnabled: true,
  secretScanStrictness: 'medium',
  secretScanAllowlist: '',
  aiAutoCommitEnabled: false,
  aiProvider: 'ollama',
  ollamaBaseUrl: 'http://127.0.0.1:11434',
  ollamaModel: '',
  geminiModel: 'gemini-3-flash-preview',
  hasGeminiApiKey: false,
  githubOauthClientId: '',
  githubHost: 'github.com',
};

type RunGitCommandOptions = {
  skipDirtyGuard?: boolean;
  skipSecretScan?: boolean;
};

const GUARDED_COMMANDS = new Set(['checkout', 'merge', 'reset']);
const SIDEBAR_COLLAPSE_STORAGE_KEY = 'open-git-control:sidebar-collapse-by-repo:v1';
const LEGACY_SIDEBAR_COLLAPSE_STORAGE_KEY = 'git-organizer:sidebar-collapse-by-repo:v1';
const SIDEBAR_GENERAL_COLLAPSE_STORAGE_KEY = 'open-git-control:sidebar-general-collapse:v1';
const LEGACY_SIDEBAR_GENERAL_COLLAPSE_STORAGE_KEY = 'git-organizer:sidebar-general-collapse:v1';

type SidebarCollapseState = {
  branchPanelCollapsed: boolean;
  tagPanelCollapsed: boolean;
  remotePanelCollapsed: boolean;
  submodulePanelCollapsed: boolean;
};

type SidebarCollapseByRepo = Record<string, SidebarCollapseState>;
type SidebarGeneralCollapseState = {
  repoPanelCollapsed: boolean;
};

const DEFAULT_SIDEBAR_COLLAPSE_STATE: SidebarCollapseState = {
  branchPanelCollapsed: false,
  tagPanelCollapsed: false,
  remotePanelCollapsed: false,
  submodulePanelCollapsed: false,
};
const DEFAULT_SIDEBAR_GENERAL_COLLAPSE_STATE: SidebarGeneralCollapseState = {
  repoPanelCollapsed: false,
};

export const useAppState = () => {
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isGitActionRunning, setIsGitActionRunning] = useState(false);
  const [activeGitActionLabel, setActiveGitActionLabel] = useState<string | null>(null);
  const isGitActionRunningRef = useRef(false);

  const [isConnectingGithubRepo, setIsConnectingGithubRepo] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [newRepoName, setNewRepoName] = useState('');
  const [newRepoDescription, setNewRepoDescription] = useState('');
  const [newRepoPrivate, setNewRepoPrivate] = useState(true);

  const [settings, setSettings] = useState<AppSettingsDto>(DEFAULT_SETTINGS);
  const [jobs, setJobs] = useState<GitJobEventDto[]>([]);
  const [sidebarCollapseByRepo, setSidebarCollapseByRepo] = useState<SidebarCollapseByRepo>({});
  const [sidebarGeneralCollapseState, setSidebarGeneralCollapseState] = useState<SidebarGeneralCollapseState>(DEFAULT_SIDEBAR_GENERAL_COLLAPSE_STATE);

  const { toast: gitActionToast, setToast: setGitActionToast } = useToastQueue(3000);

  const {
    confirmDialog,
    setConfirmDialog,
    inputDialog,
    setInputDialog,
    closeConfirmDialog,
    executeConfirmDialog,
    closeInputDialog,
    executeInputDialog,
  } = useDialogControllers();

  const tr = useCallback((deText: string, enText: string) => {
    return trByLanguage(settings.language, deText, enText);
  }, [settings.language]);

  const triggerRefresh = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  const resetRepoScopedUi = useCallback(() => {
    setSelectedCommit(null);
    setNewRepoName('');
    setNewRepoDescription('');
    setConnectError(null);
    setShowReleaseCreator(false);
    setReleaseContext(null);
    setReleaseContextError(null);
  }, []);

  const workspace = useWorkspaceDomain({
    triggerRefresh,
    setConfirmDialog,
    setGitActionToast,
    onRepoActivated: resetRepoScopedUi,
    onNoActiveRepo: resetRepoScopedUi,
    language: settings.language,
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SIDEBAR_COLLAPSE_STORAGE_KEY) ?? localStorage.getItem(LEGACY_SIDEBAR_COLLAPSE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as SidebarCollapseByRepo;
      if (parsed && typeof parsed === 'object') {
        setSidebarCollapseByRepo(parsed);
      }
    } catch {
      // ignore malformed local storage values
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSE_STORAGE_KEY, JSON.stringify(sidebarCollapseByRepo));
    } catch {
      // ignore write errors (e.g. private mode / quota)
    }
  }, [sidebarCollapseByRepo]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SIDEBAR_GENERAL_COLLAPSE_STORAGE_KEY) ?? localStorage.getItem(LEGACY_SIDEBAR_GENERAL_COLLAPSE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<SidebarGeneralCollapseState>;
      if (!parsed || typeof parsed !== 'object') return;
      setSidebarGeneralCollapseState({
        repoPanelCollapsed: Boolean(parsed.repoPanelCollapsed),
      });
    } catch {
      // ignore malformed local storage values
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_GENERAL_COLLAPSE_STORAGE_KEY, JSON.stringify(sidebarGeneralCollapseState));
    } catch {
      // ignore write errors (e.g. private mode / quota)
    }
  }, [sidebarGeneralCollapseState]);

  const activeSidebarCollapseState = workspace.activeRepo
    ? ({ ...DEFAULT_SIDEBAR_COLLAPSE_STATE, ...(sidebarCollapseByRepo[workspace.activeRepo] || {}) })
    : DEFAULT_SIDEBAR_COLLAPSE_STATE;

  const updateActiveRepoSidebarCollapse = useCallback((partial: Partial<SidebarCollapseState>) => {
    const repoPath = workspace.activeRepo;
    if (!repoPath) return;

    setSidebarCollapseByRepo(prev => {
      const current = { ...DEFAULT_SIDEBAR_COLLAPSE_STATE, ...(prev[repoPath] || {}) };
      return {
        ...prev,
        [repoPath]: {
          ...current,
          ...partial,
        },
      };
    });
  }, [workspace.activeRepo]);

  const toggleBranchPanelCollapsed = useCallback(() => {
    updateActiveRepoSidebarCollapse({
      branchPanelCollapsed: !activeSidebarCollapseState.branchPanelCollapsed,
    });
  }, [activeSidebarCollapseState.branchPanelCollapsed, updateActiveRepoSidebarCollapse]);

  const toggleTagPanelCollapsed = useCallback(() => {
    updateActiveRepoSidebarCollapse({
      tagPanelCollapsed: !activeSidebarCollapseState.tagPanelCollapsed,
    });
  }, [activeSidebarCollapseState.tagPanelCollapsed, updateActiveRepoSidebarCollapse]);

  const toggleRemotePanelCollapsed = useCallback(() => {
    updateActiveRepoSidebarCollapse({
      remotePanelCollapsed: !activeSidebarCollapseState.remotePanelCollapsed,
    });
  }, [activeSidebarCollapseState.remotePanelCollapsed, updateActiveRepoSidebarCollapse]);

  const toggleSubmodulePanelCollapsed = useCallback(() => {
    updateActiveRepoSidebarCollapse({
      submodulePanelCollapsed: !activeSidebarCollapseState.submodulePanelCollapsed,
    });
  }, [activeSidebarCollapseState.submodulePanelCollapsed, updateActiveRepoSidebarCollapse]);

  const toggleRepoPanelCollapsed = useCallback(() => {
    setSidebarGeneralCollapseState(prev => ({
      ...prev,
      repoPanelCollapsed: !prev.repoPanelCollapsed,
    }));
  }, []);

  const handleUpdateSettings = useCallback(async (partial: Partial<AppSettingsDto>) => {
    if (!window.electronAPI) return;

    try {
      const next = await window.electronAPI.setSettings(partial);
      setSettings(next);
    } catch (e: any) {
      setGitActionToast({ msg: e?.message || tr('Einstellungen konnten nicht gespeichert werden.', 'Could not save settings.'), isError: true });
    }
  }, [setGitActionToast, tr]);

  useEffect(() => {
    const loadSettings = async () => {
      if (!window.electronAPI) return;
      try {
        const loaded = await window.electronAPI.getSettings();
        setSettings(loaded);
      } catch {
        setSettings(DEFAULT_SETTINGS);
      }
    };

    loadSettings();
  }, []);

  useEffect(() => {
    document.body.setAttribute('data-theme', settings.theme);
  }, [settings.theme]);

  useEffect(() => {
    if (!window.electronAPI) return;

    const unsubscribe = window.electronAPI.onJobEvent((event) => {
      setJobs(prev => [event, ...prev].slice(0, 200));
    });

    return unsubscribe;
  }, []);

  const runGitCommand = useCallback(async (
    args: string[],
    successMsg: string,
    actionLabel?: string,
    options?: RunGitCommandOptions,
  ): Promise<boolean> => {
    if (!window.electronAPI || !workspace.activeRepo || args.length === 0) return false;

    const command = args[0];
    const shouldGuard = settings.confirmDangerousOps && !options?.skipDirtyGuard && GUARDED_COMMANDS.has(command);
    const shouldScanPushSecrets =
      command === 'push'
      && settings.secretScanBeforePushEnabled
      && !options?.skipSecretScan;

    if (shouldGuard) {
      try {
        const status = await window.electronAPI.runGitCommand('statusPorcelain');
        const hasLocalChanges = Boolean(status.success && String(status.data || '').trim().length > 0);
        if (hasLocalChanges) {
          setConfirmDialog({
            variant: 'danger',
            title: tr('Ungesicherte Ã„nderungen erkannt', 'Uncommitted changes detected'),
            message: tr(`Vor "git ${args.join(' ')}" wurden lokale Ã„nderungen gefunden.`, `Local changes were found before "git ${args.join(' ')}".`),
            contextItems: [
              { label: tr('Befehl', 'Command'), value: `git ${args.join(' ')}` },
              { label: tr('Hinweis', 'Hint'), value: tr('Working Tree ist nicht sauber', 'Working tree is dirty') },
            ],
            irreversible: false,
            consequences: tr('Je nach Operation kÃ¶nnen unstaged oder staged Ã„nderungen betroffen sein.', 'Depending on the operation, unstaged or staged changes may be affected.'),
            confirmLabel: tr('Trotzdem ausfÃ¼hren', 'Run anyway'),
            onConfirm: async () => {
              await runGitCommand(args, successMsg, actionLabel, { skipDirtyGuard: true });
            },
          });
          return false;
        }
      } catch {
        // continue without blocking if status check fails
      }
    }

    if (shouldScanPushSecrets) {
      try {
        const scanResult = await window.electronAPI.scanPushSecrets();
        if (!scanResult.success) {
          setGitActionToast({
            msg: scanResult.error || tr('Secret-Scan vor Push fehlgeschlagen.', 'Secret scan before push failed.'),
            isError: true,
          });
          return false;
        }

        const findings = scanResult.data.findings || [];
        if (findings.length > 0) {
          const contextItems = findings.slice(0, 8).map((finding, index) => ({
            label: tr(`Treffer ${index + 1}`, `Finding ${index + 1}`),
            value: `${finding.filePath}:${finding.lineNumber}  ${finding.contextLine}`,
          }));

          setConfirmDialog({
            variant: 'danger',
            title: tr('Moegliche Secrets vor Push erkannt', 'Potential secrets detected before push'),
            message: tr(
              `${findings.length} moegliche Secret-Treffer wurden im staged/zu-pushenden Diff gefunden.`,
              `${findings.length} potential secret hit(s) were found in staged/to-push diffs.`,
            ),
            contextItems,
            irreversible: true,
            consequences: tr(
              'Bitte pruefe die Treffer. Ein Push kann vertrauliche Werte unwiderruflich veroeffentlichen.',
              'Please review these findings. Pushing can irreversibly publish sensitive values.',
            ),
            confirmLabel: tr('Trotzdem pushen', 'Push anyway'),
            onConfirm: async () => {
              await runGitCommand(args, successMsg, actionLabel, { ...options, skipSecretScan: true });
            },
          });
          return false;
        }
      } catch (error: any) {
        setGitActionToast({
          msg: error?.message || tr('Secret-Scan vor Push fehlgeschlagen.', 'Secret scan before push failed.'),
          isError: true,
        });
        return false;
      }
    }

    setIsGitActionRunning(true);
    setActiveGitActionLabel(actionLabel || tr(`Git ${command} wird ausgefÃ¼hrt...`, `Running git ${command}...`));

    try {
      const r = await window.electronAPI.runGitCommand(command, ...args.slice(1));
      if (r.success) {
        setGitActionToast({ msg: successMsg, isError: false });
        triggerRefresh();
        return true;
      }
      setGitActionToast({ msg: r.error || tr('Fehler beim AusfÃ¼hren von git.', 'Error while running git.'), isError: true });
      return false;
    } catch (e: any) {
      setGitActionToast({ msg: e.message, isError: true });
      return false;
    } finally {
      setIsGitActionRunning(false);
      setActiveGitActionLabel(null);
    }
  }, [setConfirmDialog, setGitActionToast, settings.confirmDangerousOps, settings.secretScanBeforePushEnabled, triggerRefresh, workspace.activeRepo, tr]);

  isGitActionRunningRef.current = isGitActionRunning;

  const repository = useRepositoryDomain({
    activeRepo: workspace.activeRepo,
    refreshTrigger,
    triggerRefresh,
    setGitActionToast,
    setActiveGitActionLabel,
    isGitActionRunningRef,
    runGitCommand,
    setConfirmDialog,
    setInputDialog,
    autoFetchIntervalMs: settings.autoFetchIntervalMs,
    language: settings.language,
  });

  const github = useGithubDomain({
    onRepoCloned: workspace.addOpenRepo,
    setActiveTab: workspace.setActiveTab,
    language: settings.language,
    githubOauthClientId: settings.githubOauthClientId,
    githubHost: settings.githubHost,
  });

  const [showCreatePR, setShowCreatePR] = useState(false);
  const [newPRTitle, setNewPRTitle] = useState('');
  const [newPRBody, setNewPRBody] = useState('');
  const [newPRHead, setNewPRHead] = useState('');
  const [newPRBase, setNewPRBase] = useState('main');

  const [releaseForm, setReleaseFormState] = useState<GitHubCreateReleaseParamsDto>({
    owner: '',
    repo: '',
    tagName: '',
    targetCommitish: '',
    releaseName: '',
    body: '',
    draft: false,
    prerelease: false,
  });
  const [releaseSubmitting, setReleaseSubmitting] = useState(false);
  const [releaseError, setReleaseError] = useState<string | null>(null);
  const [releaseSuccess, setReleaseSuccess] = useState<GitHubReleaseDto | null>(null);
  const [showReleaseCreator, setShowReleaseCreator] = useState(false);
  const [releaseContextLoading, setReleaseContextLoading] = useState(false);
  const [releaseContextError, setReleaseContextError] = useState<string | null>(null);
  const [releaseContext, setReleaseContext] = useState<GitHubReleaseContextDto | null>(null);
  const [releaseNotesGenerating, setReleaseNotesGenerating] = useState(false);

  const pullRequestDomain = usePullRequests({
    activeRepo: workspace.activeRepo,
    isAuthenticated: github.isAuthenticated,
    refreshTrigger,
    language: settings.language,
    githubHost: settings.githubHost,
    onCreated: (number) => {
      setGitActionToast({ msg: tr(`PR #${number} erstellt.`, `Created PR #${number}.`), isError: false });
      setShowCreatePR(false);
      setNewPRTitle('');
      setNewPRBody('');
      triggerRefresh();
    },
    onError: (message) => {
      setGitActionToast({ msg: message, isError: true });
    },
  });

  const handleCreateGithubRepoForCurrent = async () => {
    if (!window.electronAPI || !workspace.activeRepo) return;
    if (!github.isAuthenticated) {
      setConnectError(tr('Bitte zuerst GitHub verbinden (GitHub-Tab).', 'Please connect GitHub first (GitHub tab).'));
      return;
    }

    const folderName = workspace.activeRepo.split(/[\\/]/).pop() || 'repository';
    const name = (newRepoName || folderName).trim();
    const description = newRepoDescription.trim();

    if (!name) {
      setConnectError(tr('Repository-Name darf nicht leer sein.', 'Repository name must not be empty.'));
      return;
    }

    setIsConnectingGithubRepo(true);
    setConnectError(null);

    try {
      const result = await window.electronAPI.githubCreateRepo(name, description, newRepoPrivate);
      if (!result.success) {
        throw new Error(result.error || tr('Fehler beim Erstellen des GitHub-Repositories.', 'Error while creating the GitHub repository.'));
      }

      const remoteUrl = result.data.cloneUrl;

      let r = await window.electronAPI.runGitCommand('remote', 'add', 'origin', remoteUrl);
      if (!r.success) {
        throw new Error(r.error || tr('Fehler beim Setzen des Git-Remotes.', 'Error while setting Git remote.'));
      }

      const pushed = await runGitCommand(
        ['push', '-u', 'origin', 'HEAD'],
        tr('Branch nach GitHub gepusht.', 'Pushed branch to GitHub.'),
      );
      if (!pushed) {
        throw new Error(tr('Fehler beim Pushen nach GitHub.', 'Error while pushing to GitHub.'));
      }

      repository.setHasRemoteOrigin(true);
      setGitActionToast({ msg: tr('Neues GitHub-Repository erstellt und verbunden.', 'Created and connected new GitHub repository.'), isError: false });
      triggerRefresh();
    } catch (e: any) {
      setConnectError(e?.message || tr('Fehler beim Erstellen und Verbinden mit GitHub.', 'Error while creating and connecting GitHub repository.'));
    } finally {
      setIsConnectingGithubRepo(false);
    }
  };

  const handleCreatePR = async () => {
    await pullRequestDomain.createPR({
      title: newPRTitle,
      body: newPRBody,
      head: newPRHead,
      base: newPRBase,
      currentBranch: repository.currentBranch,
    });
  };


  const setReleaseForm = useCallback((updater: (prev: GitHubCreateReleaseParamsDto) => GitHubCreateReleaseParamsDto) => {
    setReleaseFormState(prev => {
      const next = updater(prev);
      return {
        ...next,
        owner: pullRequestDomain.prOwnerRepo?.owner || '',
        repo: pullRequestDomain.prOwnerRepo?.repo || '',
      };
    });
  }, [pullRequestDomain.prOwnerRepo]);

  useEffect(() => {
    setReleaseFormState(prev => ({
      ...prev,
      owner: pullRequestDomain.prOwnerRepo?.owner || '',
      repo: pullRequestDomain.prOwnerRepo?.repo || '',
      targetCommitish: prev.targetCommitish || repository.currentBranch,
    }));
  }, [pullRequestDomain.prOwnerRepo, repository.currentBranch]);

  const refreshReleaseContext = useCallback(async () => {
    if (!window.electronAPI || !github.isAuthenticated || !pullRequestDomain.prOwnerRepo) {
      setReleaseContext(null);
      setReleaseContextError(tr('GitHub-Verbindung oder Repository-Zuordnung fehlt.', 'GitHub connection or repository mapping is missing.'));
      return;
    }

    setReleaseContextLoading(true);
    setReleaseContextError(null);

    try {
      const result = await window.electronAPI.githubGetReleaseContext({
        owner: pullRequestDomain.prOwnerRepo.owner,
        repo: pullRequestDomain.prOwnerRepo.repo,
        targetCommitish: (releaseForm.targetCommitish || '').trim() || repository.currentBranch,
      });

      if (!result.success) {
        setReleaseContext(null);
        setReleaseContextError(result.error || tr('Release-Kontext konnte nicht geladen werden.', 'Could not load release context.'));
        return;
      }

      setReleaseContext(result.data);
      const existingTag = (releaseForm.tagName || '').trim();
      if (!existingTag) {
        const suggestion = suggestNextReleaseTag(result.data.existingTags || []);
        setReleaseFormState((prev) => ({
          ...prev,
          tagName: prev.tagName || suggestion,
          releaseName: prev.releaseName || `Release ${prev.tagName || suggestion}`,
        }));
      }
    } catch (error: any) {
      setReleaseContext(null);
      setReleaseContextError(error?.message || tr('Release-Kontext konnte nicht geladen werden.', 'Could not load release context.'));
    } finally {
      setReleaseContextLoading(false);
    }
  }, [
    github.isAuthenticated,
    pullRequestDomain.prOwnerRepo,
    releaseForm.tagName,
    releaseForm.targetCommitish,
    repository.currentBranch,
    tr,
  ]);

  const handleCreateRelease = useCallback(async () => {
    if (!window.electronAPI || !github.isAuthenticated || !pullRequestDomain.prOwnerRepo) {
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
        setReleaseError(tr('Tag-Name enthält ungültige Zeichen oder Leerzeichen.', 'Tag name contains invalid characters or whitespace.'));
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

    setReleaseSubmitting(true);
    setReleaseError(null);
    setReleaseSuccess(null);

    try {
      const result = await window.electronAPI.githubCreateRelease({
        owner: pullRequestDomain.prOwnerRepo.owner,
        repo: pullRequestDomain.prOwnerRepo.repo,
        tagName: releaseForm.tagName.trim(),
        targetCommitish: (releaseForm.targetCommitish || '').trim() || repository.currentBranch,
        releaseName: releaseForm.releaseName.trim(),
        body: (releaseForm.body || '').trim(),
        draft: Boolean(releaseForm.draft),
        prerelease: Boolean(releaseForm.prerelease),
      });

      if (!result.success) {
        const errorText = result.error || '';
        const normalized = errorText.toLowerCase();

        if (normalized.includes('tag existiert bereits') || normalized.includes('already_exists')) {
          setReleaseError(tr('Dieser Tag existiert bereits. Wähle einen anderen Tag oder verwende den bestehenden Tag.', 'This tag already exists. Choose a different tag or use the existing tag.'));
          return;
        }

        if (normalized.includes('berechtigung') || normalized.includes('permission') || normalized.includes('forbidden')) {
          setReleaseError(tr('Fehlende Berechtigung für das Repository. Prüfe Token-Scopes und Repo-Zugriff.', 'Missing repository permission. Check token scopes and repo access.'));
          return;
        }

        if (normalized.includes('targetcommitish') || normalized.includes('target_commitish')) {
          setReleaseError(tr('Ziel-Branch/Ziel-Commit ist ungültig. Bitte Branch oder SHA prüfen.', 'Target branch/commit is invalid. Please verify branch or SHA.'));
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
    } catch (error: any) {
      setReleaseError(error?.message || tr('Release konnte nicht erstellt werden.', 'Could not create release.'));
    } finally {
      setReleaseSubmitting(false);
    }
  }, [github.isAuthenticated, pullRequestDomain.prOwnerRepo, releaseForm, releaseContext?.existingTags, repository.currentBranch, tr, triggerRefresh, setGitActionToast]);

  const generateReleaseNotesWithAI = useCallback(async () => {
    if (!window.electronAPI) return;
    if (!github.isAuthenticated || !pullRequestDomain.prOwnerRepo) {
      setReleaseError(tr('GitHub-Verbindung oder Repository-Zuordnung fehlt.', 'GitHub connection or repository mapping is missing.'));
      return;
    }

    const commits = releaseContext?.commitsSinceLastRelease || [];
    if (commits.length === 0) {
      setReleaseError(tr('Keine Commit-Basis fuer KI vorhanden.', 'No commit base for AI generation available.'));
      return;
    }

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
        language: settings.language,
      });

      if (!result.success) {
        setReleaseError(result.error || tr('KI Release Notes konnten nicht erstellt werden.', 'Could not generate AI release notes.'));
        return;
      }

      setReleaseFormState((prev) => ({
        ...prev,
        releaseName: prev.releaseName || releaseName,
        body: result.data.markdown,
      }));
      setGitActionToast({ msg: tr('Release Notes mit KI erstellt.', 'AI release notes generated.'), isError: false });
    } catch (error: any) {
      setReleaseError(error?.message || tr('KI Release Notes konnten nicht erstellt werden.', 'Could not generate AI release notes.'));
    } finally {
      setReleaseNotesGenerating(false);
    }
  }, [
    github.isAuthenticated,
    pullRequestDomain.prOwnerRepo,
    releaseContext,
    releaseForm.tagName,
    releaseForm.releaseName,
    settings.language,
    tr,
    setGitActionToast,
  ]);

  const openReleaseCreator = useCallback(() => {
    setShowReleaseCreator(true);
    setReleaseError(null);
  }, []);

  const closeReleaseCreator = useCallback(() => {
    setShowReleaseCreator(false);
  }, []);

  useEffect(() => {
    if (!showReleaseCreator) return;
    void refreshReleaseContext();
  }, [showReleaseCreator, refreshReleaseContext]);

  const handleOpenPR = (url: string) => {
    window.open(url, '_blank');
  };

  const handleCopyPRUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setGitActionToast({ msg: tr('PR-URL kopiert.', 'Copied PR URL.'), isError: false });
    } catch {
      setGitActionToast({ msg: tr('PR-URL konnte nicht kopiert werden.', 'Could not copy PR URL.'), isError: true });
    }
  };

  const handleMergePR = async (
    prNumber: number,
    mergeMethod: 'merge' | 'squash' | 'rebase' = 'merge',
  ) => {
    if (!window.electronAPI || !pullRequestDomain.prOwnerRepo) return;

    try {
      const result = await window.electronAPI.githubMergePR({
        owner: pullRequestDomain.prOwnerRepo.owner,
        repo: pullRequestDomain.prOwnerRepo.repo,
        pullNumber: prNumber,
        mergeMethod,
      });

      if (!result.success) {
        setGitActionToast({ msg: result.error || tr('PR konnte nicht gemergt werden.', 'Could not merge PR.'), isError: true });
        return;
      }

      setGitActionToast({ msg: tr(`PR #${prNumber} wurde gemergt.`, `PR #${prNumber} merged.`), isError: false });
      triggerRefresh();
    } catch (error: any) {
      setGitActionToast({ msg: error?.message || tr('PR konnte nicht gemergt werden.', 'Could not merge PR.'), isError: true });
    }
  };

  const handleCheckoutPR = async (prNumber: number, headRef: string) => {
    const targetBranch = `pr-${prNumber}-${headRef.replace(/[^a-zA-Z0-9._-]/g, '-')}`;
    const fetched = await runGitCommand(
      ['fetch', 'origin', `pull/${prNumber}/head:${targetBranch}`],
      tr(`PR #${prNumber} Branch geladen.`, `Loaded branch for PR #${prNumber}.`),
      tr(`PR #${prNumber} wird geladen...`, `Loading PR #${prNumber}...`),
      { skipDirtyGuard: true },
    );
    if (!fetched) return;
    await runGitCommand(['checkout', targetBranch], tr(`PR-Branch ${targetBranch} ausgecheckt.`, `Checked out PR branch ${targetBranch}.`));
  };

  const handleSetUpstreamForCurrentBranch = useCallback(async () => {
    if (!workspace.activeRepo || !repository.currentBranch) return;

    const setTracking = await runGitCommand(
      ['branch', '--set-upstream-to', `origin/${repository.currentBranch}`, repository.currentBranch],
      tr(`Tracking gesetzt: ${repository.currentBranch} -> origin/${repository.currentBranch}`, `Tracking set: ${repository.currentBranch} -> origin/${repository.currentBranch}`),
    );

    if (!setTracking) {
      await runGitCommand(
        ['push', '-u', 'origin', repository.currentBranch],
        tr(`Branch ${repository.currentBranch} mit Upstream gepusht.`, `Pushed branch ${repository.currentBranch} with upstream.`),
      );
    }
  }, [repository.currentBranch, runGitCommand, workspace.activeRepo, tr]);

  const handleCheckoutRemoteBranch = useCallback(async (remoteBranchName: string) => {
    const normalized = (remoteBranchName || '').trim();
    if (!normalized) return;

    const shortName = normalized.replace(/^remotes\//, '').replace(/^origin\//, '').replace(/^[^/]+\//, '');
    await runGitCommand(
      ['checkout', '-b', shortName, '--track', normalized],
      tr(`Branch ${shortName} aus ${normalized} ausgecheckt.`, `Checked out branch ${shortName} from ${normalized}.`),
    );
  }, [runGitCommand, tr]);

  const clearJobs = () => setJobs([]);

  return {
    activeTab: workspace.activeTab,
    setActiveTab: workspace.setActiveTab,
    openRepos: workspace.openRepos,
    repoMeta: workspace.repoMeta,
    activeRepo: workspace.activeRepo,
    handleOpenFolder: workspace.handleOpenFolder,
    handleSwitchRepo: workspace.handleSwitchRepo,
    handleCloseRepo: workspace.handleCloseRepo,
    handleToggleRepoPin: workspace.toggleRepoPin,

    refreshTrigger,
    triggerRefresh,
    selectedCommit,
    setSelectedCommit,

    isGitActionRunning,
    activeGitActionLabel,
    runGitCommand,
    gitActionToast,

    branches: repository.branches,
    currentBranch: repository.currentBranch,
    isCreatingBranch: repository.isCreatingBranch,
    setIsCreatingBranch: repository.setIsCreatingBranch,
    newBranchName: repository.newBranchName,
    setNewBranchName: repository.setNewBranchName,
    newBranchInputRef: repository.newBranchInputRef,
    branchContextMenu: repository.branchContextMenu,
    setBranchContextMenu: repository.setBranchContextMenu,
    isBranchPanelCollapsed: activeSidebarCollapseState.branchPanelCollapsed,
    toggleBranchPanelCollapsed,
    isTagPanelCollapsed: activeSidebarCollapseState.tagPanelCollapsed,
    toggleTagPanelCollapsed,
    isRepoPanelCollapsed: sidebarGeneralCollapseState.repoPanelCollapsed,
    toggleRepoPanelCollapsed,

    tags: repository.tags,
    remotes: repository.remotes,
    submodules: repository.submodules,
    hasRemoteOrigin: repository.hasRemoteOrigin,
    remoteSync: repository.remoteSync,
    remoteOnlyBranches: repository.remoteOnlyBranches,
    remoteStatus: repository.remoteStatus,
    refreshRemoteState: repository.refreshRemoteState,
    isRemotePanelCollapsed: activeSidebarCollapseState.remotePanelCollapsed,
    toggleRemotePanelCollapsed,
    isSubmodulePanelCollapsed: activeSidebarCollapseState.submodulePanelCollapsed,
    toggleSubmodulePanelCollapsed,

    handleCreateBranch: repository.handleCreateBranch,
    handleDeleteBranch: repository.handleDeleteBranch,
    handleMergeBranch: repository.handleMergeBranch,
    handleRenameBranch: repository.handleRenameBranch,
    handleCreateTag: repository.handleCreateTag,
    handleDeleteTag: repository.handleDeleteTag,
    handlePushTags: repository.handlePushTags,
    handleAddRemote: repository.handleAddRemote,
    handleRemoveRemote: repository.handleRemoveRemote,
    handleSubmoduleInitUpdate: repository.handleSubmoduleInitUpdate,
    handleSubmoduleSync: repository.handleSubmoduleSync,
    handleOpenSubmodule: repository.handleOpenSubmodule,
    handleSetUpstreamForCurrentBranch,
    handleCheckoutRemoteBranch,

    isAuthenticated: github.isAuthenticated,
    githubUser: github.githubUser,
    githubRepos: github.githubRepos,
    githubRepoSearch: github.githubRepoSearch,
    setGithubRepoSearch: github.setGithubRepoSearch,
    githubReposHasMore: github.githubReposHasMore,
    isLoadingGithubRepos: github.isLoadingRepos,
    isLoadingMoreGithubRepos: github.isLoadingMoreRepos,
    loadMoreGithubRepos: () => { void github.loadMoreRepos(); },
    refreshGithubRepos: () => { void github.refreshRepos(); },
    tokenInput: github.tokenInput,
    setTokenInput: github.setTokenInput,
    isAuthenticating: github.isAuthenticating,
    authError: github.authError,
    setAuthError: github.setAuthError,
    handleTokenLogin: github.handleTokenLogin,
    oauthConfigured: github.oauthConfigured,
    deviceFlow: github.deviceFlow,
    isDeviceFlowRunning: github.isDeviceFlowRunning,
    deviceFlowError: github.deviceFlowError,
    handleStartDeviceFlowLogin: github.handleStartDeviceFlowLogin,
    handleCancelDeviceFlow: github.handleCancelDeviceFlow,
    isWebFlowRunning: github.isWebFlowRunning,
    webFlowError: github.webFlowError,
    handleStartWebFlowLogin: github.handleStartWebFlowLogin,
    handleLogout: github.handleLogout,

    isCloning: github.isCloning,
    setIsCloning: github.setIsCloning,
    cloneLog: github.cloneLog,
    cloneRepoName: github.cloneRepoName,
    cloneFinished: github.cloneFinished,
    cloneError: github.cloneError,
    handleClone: github.handleClone,

    prOwnerRepo: pullRequestDomain.prOwnerRepo,
    prFilter: pullRequestDomain.prFilter,
    setPrFilter: pullRequestDomain.setPrFilter,
    prLoading: pullRequestDomain.prLoading,
    pullRequests: pullRequestDomain.pullRequests,
    prCiByNumber: pullRequestDomain.prCiByNumber,
    showCreatePR,
    setShowCreatePR,
    newPRTitle,
    setNewPRTitle,
    newPRBody,
    setNewPRBody,
    newPRHead,
    setNewPRHead,
    newPRBase,
    setNewPRBase,
    handleCreatePR,
    releaseForm,
    setReleaseForm,
    releaseSubmitting,
    releaseError,
    releaseSuccess,
    showReleaseCreator,
    openReleaseCreator,
    closeReleaseCreator,
    releaseContextLoading,
    releaseContextError,
    releaseContext,
    refreshReleaseContext,
    releaseNotesGenerating,
    generateReleaseNotesWithAI,
    handleCreateRelease,
    handleOpenPR,
    handleCopyPRUrl,
    handleCheckoutPR,
    handleMergePR,

    settings,
    handleUpdateSettings,
    jobs,
    clearJobs,

    isConnectingGithubRepo,
    connectError,
    newRepoName,
    setNewRepoName,
    newRepoDescription,
    setNewRepoDescription,
    newRepoPrivate,
    setNewRepoPrivate,
    handleCreateGithubRepoForCurrent,

    confirmDialog,
    inputDialog,
    closeConfirmDialog,
    executeConfirmDialog,
    closeInputDialog,
    executeInputDialog,
  };
};






