import type { AppTabId } from '@/app/state/contracts';
import type { TranslationVariables } from '@/i18n';
import type { DiffRequest } from '@/types/diff';

export type MainPrimaryRoute =
  | 'localRepos'
  | 'planner'
  | 'settings'
  | 'runConfig'
  | 'remoteConfig'
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
  showRemoteConfig?: boolean;
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
  showRemoteConfig,
}: RouteParams): MainPrimaryRoute => {
  if (activeTab === 'localRepos') return 'localRepos';
  if (activeTab === 'planner') return 'planner';
  if (activeTab === 'settings') return 'settings';
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
    case 'settings':
      return t('generated.components.layout.main.mainprimarypane.settings_c6256784');
    case 'runConfig':
      return tr('Run-Konfiguration', 'Run configuration');
    case 'remoteConfig':
      return tr('Remote-Konfiguration', 'Remote configuration');
    case 'timeline':
      return t('generated.components.layout.main.mainprimarypane.codebase_timeline_cd023f25');
    case 'recovery':
      return t('generated.components.layout.main.mainprimarypane.recovery_center_0adebec8');
    case 'conflict':
      return t('generated.components.layout.main.mainprimarypane.conflict_resolver_1f790ac5');
    case 'diff':
      return t('generated.components.layout.main.mainprimarypane.diff_viewer_979e21a6');
    case 'file':
      return 'File viewer';
    default:
      return '';
  }
};

export const hasMainPrimaryHeader = (route: MainPrimaryRoute): boolean =>
  route !== 'localRepos' && route !== 'planner' && route !== 'hosting' && route !== 'graph' && route !== 'runConsole';
