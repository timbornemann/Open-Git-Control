import type { AppTabId } from '@/app/state/contracts';
import type { TranslationVariables } from '@/i18n';
import type { DiffRequest } from '@/types/diff';

export type MainPrimaryRoute = 'planner' | 'settings' | 'release' | 'timeline' | 'githubGuide' | 'recovery' | 'conflict' | 'diff' | 'file' | 'graph';

type RouteParams = {
  activeConflictPath: string | null;
  activeDiffRequest: DiffRequest | null;
  workingDirectoryFilePath?: string | null;
  activeTab: AppTabId;
  isAuthenticated: boolean;
  selectedGithubAuthHelpMethod: unknown;
  showRecoveryCenter: boolean;
  showReleaseCreator: boolean;
  showTimeline: boolean;
};

type Translate = (key: string, variables?: TranslationVariables) => string;

export const getMainPrimaryRoute = ({
  activeConflictPath,
  activeDiffRequest,
  workingDirectoryFilePath,
  activeTab,
  isAuthenticated,
  selectedGithubAuthHelpMethod,
  showRecoveryCenter,
  showReleaseCreator,
  showTimeline,
}: RouteParams): MainPrimaryRoute => {
  if (activeTab === 'planner') return 'planner';
  if (activeTab === 'settings') return 'settings';
  if (activeTab === 'repo' && showReleaseCreator) return 'release';
  if (activeTab === 'repo' && showTimeline) return 'timeline';
  if (activeTab === 'github' && !isAuthenticated && Boolean(selectedGithubAuthHelpMethod)) return 'githubGuide';
  if (showRecoveryCenter) return 'recovery';
  if (activeConflictPath) return 'conflict';
  if (activeDiffRequest) return 'diff';
  if (workingDirectoryFilePath) return 'file';
  return 'graph';
};

export const getMainPrimaryTitle = (route: MainPrimaryRoute, t: Translate): string => {
  switch (route) {
    case 'settings':
      return t('generated.components.layout.main.mainprimarypane.settings_c6256784');
    case 'release':
      return t('generated.components.layout.main.mainprimarypane.release_creator_e28377be');
    case 'timeline':
      return t('generated.components.layout.main.mainprimarypane.codebase_timeline_cd023f25');
    case 'githubGuide':
      return t('generated.components.layout.main.mainprimarypane.github_login_guide_c2a55182');
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

export const hasMainPrimaryHeader = (route: MainPrimaryRoute): boolean => route !== 'planner' && route !== 'graph';
