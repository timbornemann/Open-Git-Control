import type { AppTabId } from '@/app/state/contracts';
import type { TranslationVariables } from '@/i18n';
import type { DiffRequest } from '@/types/diff';

export type MainPrimaryRoute =
  | 'localRepos'
  | 'planner'
  | 'settings'
  | 'runConfig'
  | 'secretScanAllowlist'
  | 'remoteConfig'
  | 'analytics'
  | 'releaseCreator'
  | 'repositoryPublication'
  | 'timeline'
  | 'runConsole'
  | 'hosting'
  | 'recovery'
  | 'conflict'
  | 'diff'
  | 'file'
  | 'graph';

type RouteParams = {
  activeConflictPath: string | null;
  activeDiffRequest: DiffRequest | null;
  workingDirectoryFilePath?: string | null;
  activeTab: AppTabId;
  showRecoveryCenter: boolean;
  showTimeline: boolean;
  showRunConsole: boolean;
  showRunConfig?: boolean;
  showSecretScanAllowlist?: boolean;
  showRemoteConfig?: boolean;
  showReleaseCreator?: boolean;
  showRepositoryPublication?: boolean;
};

type Translate = (key: string, variables?: TranslationVariables) => string;

export const getMainPrimaryRoute = ({
  activeConflictPath,
  activeDiffRequest,
  workingDirectoryFilePath,
  activeTab,
  showRecoveryCenter,
  showTimeline,
  showRunConsole,
  showRunConfig,
  showSecretScanAllowlist,
  showRemoteConfig,
  showReleaseCreator,
  showRepositoryPublication,
}: RouteParams): MainPrimaryRoute => {
  if (activeTab === 'localRepos') return 'localRepos';
  if (activeTab === 'planner') return 'planner';
  if (activeTab === 'settings') return 'settings';
  if (activeTab === 'analytics') return 'analytics';
  if (activeTab === 'repo' && showSecretScanAllowlist) return 'secretScanAllowlist';
  if (activeTab === 'repo' && showRepositoryPublication) return 'repositoryPublication';
  if (activeTab === 'repo' && showReleaseCreator) return 'releaseCreator';
  if (activeTab === 'repo' && showRemoteConfig) return 'remoteConfig';
  if (activeTab === 'repo' && showRunConfig) return 'runConfig';
  if (activeTab === 'repo' && showTimeline) return 'timeline';
  if (activeTab === 'repo' && showRunConsole) return 'runConsole';
  if (activeTab === 'hosting' || activeTab === 'github') return 'hosting';
  if (showRecoveryCenter) return 'recovery';
  if (activeConflictPath) return 'conflict';
  if (activeDiffRequest) return 'diff';
  if (workingDirectoryFilePath) return 'file';
  return 'graph';
};

export const getMainPrimaryTitle = (route: MainPrimaryRoute, t: Translate, tr: (de: string, en: string) => string): string => {
  switch (route) {
    case 'analytics':
      return tr('Statistik & Analyse', 'Statistics & analytics');
    case 'settings':
      return t('generated.components.layout.main.mainprimarypane.settings_c6256784');
    case 'runConfig':
      return tr('Run-Konfiguration', 'Run configuration');
    case 'secretScanAllowlist':
      return tr('Secret-Scan-Allowlist', 'Secret-scan allowlist');
    case 'remoteConfig':
      return tr('Remote-Konfiguration', 'Remote configuration');
    case 'releaseCreator':
      return tr('Release erstellen', 'Create release');
    case 'repositoryPublication':
      return tr('Repository veröffentlichen', 'Publish repository');
    case 'timeline':
      return t('generated.components.layout.main.mainprimarypane.codebase_timeline_cd023f25');
    case 'recovery':
      return t('generated.components.layout.main.mainprimarypane.recovery_center_0adebec8');
    case 'conflict':
      return t('generated.components.layout.main.mainprimarypane.conflict_resolver_1f790ac5');
    case 'diff':
    case 'file':
      return tr('Datei-Viewer', 'File viewer');
    default:
      return '';
  }
};

export const hasMainPrimaryHeader = (route: MainPrimaryRoute): boolean =>
  route !== 'localRepos' && route !== 'planner' && route !== 'analytics' && route !== 'hosting' && route !== 'graph' && route !== 'runConsole';
