import type { ElectronFlatAPI } from '@/shared/ipc/contracts/electronApi';
import type { TutorialLaunchContext } from '@/shared/tutorial/types';
import type { SystemToolsStatus } from '@/shared/ipc/systemTools';
import type { StoredRepoData } from '@/types/appDtos';
import { DEFAULT_SETTINGS } from '@/app/state/defaultSettings';
import { demoAnalytics } from './demoAnalytics';
import { validateDemoJsonSchema } from './demoSchemaValidation';
import { reachableDemoCommits } from './demoBranchRefs';
import { isRepositoryUiPreferences, type RepositoryUiPreferences } from '@/shared/ipc/repositoryUiPreferences';
import { DEMO_REPO, DEMO_TIME, ok, unavailable, type DemoRepository } from './demoRepository';

export function createDemoSystemApi(
  repo: DemoRepository,
  context: TutorialLaunchContext & { practiceSignoff?: boolean },
  stored: StoredRepoData,
): Partial<ElectronFlatAPI> {
  let uiPreferences: Record<string, RepositoryUiPreferences> = {};
  let settings = {
    ...DEFAULT_SETTINGS,
    language: context.language,
    theme: context.theme,
    commitSignoffByDefault: Boolean(context.practiceSignoff),
    autoFetchIntervalMs: 0,
    autoUpdateEnabled: false,
    autoUpdateCheckEnabled: false,
    userNotesCheckEnabled: false,
    ollamaModel: 'tutorial-model',
  };
  const tools: SystemToolsStatus = {
    platform: 'other',
    checkedAt: DEMO_TIME,
    installation: null,
    tools: ['git', 'git-lfs', 'github-cli'].map((id) => ({
      id: id as 'git' | 'git-lfs' | 'github-cli',
      required: id === 'git',
      state: 'available',
      version: 'Übungsmodus / Practice mode',
      downloadUrl: '',
      instructionsUrl: '',
    })),
  };
  const updateSettings = async (partial: Partial<typeof settings>) => {
    settings = { ...settings, ...partial };
    repo.mark('setting-changed');
    return settings;
  };
  return {
    getSettings: async () => settings,
    setSettings: updateSettings,
    setGeminiApiKey: async () => updateSettings({ hasGeminiApiKey: true }),
    clearGeminiApiKey: async () => updateSettings({ hasGeminiApiKey: false }),
    setOpenAiApiKey: async () => updateSettings({ hasOpenAiApiKey: true }),
    clearOpenAiApiKey: async () => updateSettings({ hasOpenAiApiKey: false }),
    getBootstrap: async () => ({ settings, repositories: structuredClone(stored), snapshots: [], systemTools: tools }),
    selectFiles: async () => [],
    getSystemToolsStatus: async () => tools,
    recheckSystemTools: async () => tools,
    getTutorialProgress: async () => ({ ...context.progress, welcomeSeen: true }),
    acknowledgeTutorialWelcome: async () => ({ ...context.progress, welcomeSeen: true }),
    startTutorial: async (request) => {
      window.dispatchEvent(new CustomEvent('tutorial:launch', { detail: request }));
      return { success: true };
    },
    getRepositoryUiPreferences: async () => ok(structuredClone(uiPreferences)),
    updateRepositoryUiPreferences: async ({ repoPath, patch }) => {
      if (!repo.hasProject(repoPath) || !isRepositoryUiPreferences(patch)) return unavailable();
      uiPreferences = { ...uiPreferences, [repoPath]: { ...uiPreferences[repoPath], ...patch } };
      return ok(structuredClone(uiPreferences));
    },
    savePreviews: async () => undefined,
    cancelReadRequest: async () => undefined,
    getGitLfsStatus: async (request) =>
      ok({
        available: true,
        files: request.files.map((file) => ({ ...file, version: 'demo', bytes: 64, eligible: false, configured: false, pointer: false, needsRestage: false })),
      }),
    getRepositorySecretScanAllowlist: async (repoPath) =>
      ok({ repoPath, relativePath: '.Open-Git-Control/secret-scan-allowlist.txt', exists: false, text: '', version: 'demo' }),
    watchRepositorySecretScanAllowlist: async () => ok(true),
    getAppVersion: async () => '3.2.3 · Tutorial',
    getUpdaterStatus: async () => ({
      isSupported: false,
      state: 'idle',
      currentVersion: '3.2.3',
      availableVersion: null,
      downloaded: false,
      downloadPercent: null,
      bytesPerSecond: null,
      transferred: null,
      total: null,
      lastCheckedAt: null,
      releaseNotes: null,
      error: null,
    }),
    getUserNotesStatus: async () => ({ state: 'ready', notes: [], lastCheckedAt: DEMO_TIME, error: null }),
    getFeedbackReportCapability: async () => ({ directSubmissionAvailable: false, reason: 'not-authenticated' }),
    getPlanningApiInfo: async () => ({
      enabled: true,
      status: 'running',
      host: '127.0.0.1',
      port: 2990,
      preferredPort: 2990,
      baseUrl: 'http://127.0.0.1:2990',
      apiUrl: 'http://127.0.0.1:2990/api/',
      mcpUrl: 'http://127.0.0.1:2990/mcp',
      docsUrl: 'http://127.0.0.1:2990/api/',
      openApiUrl: 'http://127.0.0.1:2990/api/openapi.json',
      authRequired: true,
      authHeaderName: 'x-open-git-control-token',
      authToken: 'tutorial-example-token',
      authTokenSource: 'session',
      authTokenCreatedAt: DEMO_TIME,
      authTokenExpiresAt: null,
      authTokenPersistent: false,
      authTokenManageable: false,
      authTokenStorageAvailable: false,
    }),
    getDiagnosticsReport: async () =>
      ok({
        generatedAt: new Date(DEMO_TIME).toISOString(),
        appVersion: '3.2.3',
        platform: 'tutorial',
        activeRepo: DEMO_REPO,
        report: 'Open-Git-Control · Übungsmodus / Practice mode\nAll diagnostics are simulated.',
      }),
    inspectStorage: async () => ok({ checkedAt: DEMO_TIME, groups: [], issues: [], repositories: [], removedRepositories: [], reports: [] }),
    getCompletedRecoveryBackups: async () => ok([]),
    getRepositoryAnalyticsSnapshot: async (request) => ok(demoAnalytics(repo, request.filters)),
    refreshRepositoryAnalytics: async (request) => ok(demoAnalytics(repo, request.filters)),
    getRepositoryAnalyticsDetails: async (request) => {
      const snapshot = demoAnalytics(repo);
      const items =
        request.kind === 'commits'
          ? reachableDemoCommits(repo).map((commit) => ({
              hash: commit.hash,
              parents: commit.parent.split(/\s+/).filter(Boolean),
              author: snapshot.authors[0],
              date: Date.parse(commit.date),
              subject: commit.subject,
              files: 1,
              additions: 3,
              deletions: 1,
            }))
          : request.kind === 'coupling'
            ? snapshot.coupling
            : snapshot.hotspots;
      return ok({ items: items.slice(request.offset, request.offset + request.limit), total: items.length, offset: request.offset });
    },
    aiGenerateCommitMessage: async () => {
      repo.mark('ai-generated');
      return ok({ title: 'docs: Begrüßung im Lernprojekt verbessern', description: 'Eine freundliche Begrüßung ergänzen.' });
    },
    aiListModels: async () => ok(['tutorial-model']),
    aiGenerateReleaseNotes: async () =>
      ok({ markdown: '## Änderungen / Changes\n\n- Eine freundliche Begrüßung ergänzt. / Added a friendly welcome.\n', source: 'ai' }),
    aiTestConnection: async () => ok({ ok: true, provider: 'ollama', model: 'tutorial-model', detail: 'Übungsmodell / Practice model' }),
    getAiAutoCommitState: async () => ok(null),
    openExternalUrl: async () => unavailable(),
    openRepositoryPath: async () => unavailable(),
    writeClipboardText: async () => ({ success: true }),
    validateJsonSchema: validateDemoJsonSchema,
  };
}
