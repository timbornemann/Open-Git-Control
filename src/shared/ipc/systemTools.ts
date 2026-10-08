export const SYSTEM_TOOL_IDS = ['git', 'git-lfs', 'github-cli'] as const;
export type SystemToolId = (typeof SYSTEM_TOOL_IDS)[number];
export type SystemToolState = 'checking' | 'available' | 'missing' | 'unusable';
export type SystemToolInstallMethod = 'winget' | 'brew' | 'apt-get' | 'dnf' | 'pacman' | 'zypper';
export type SystemToolInstallPlan = {
  method: SystemToolInstallMethod;
  packageName: string;
  source: string;
  command: string;
  available: boolean;
  reason?: string;
  /** WinGet agreements are shown before the user can explicitly accept them. */
  agreements?: string;
};
export type SystemToolStatus = {
  id: SystemToolId;
  required: boolean;
  state: SystemToolState;
  version?: string;
  executable?: string;
  detail?: string;
  downloadUrl: string;
  instructionsUrl: string;
  installation?: SystemToolInstallPlan;
};
export type SystemToolsStatus = {
  platform: 'win32' | 'darwin' | 'linux' | 'other';
  checkedAt: number | null;
  tools: SystemToolStatus[];
  installation: SystemToolInstallEvent | null;
};
export type SystemToolInstallEvent = {
  operationId: string;
  toolId: SystemToolId;
  phase: 'preparing' | 'installing' | 'verifying' | 'done' | 'failed' | 'cancelled' | 'agreements-required';
  detail?: string;
  agreements?: string;
};
export type InstallSystemToolRequest = { toolId: SystemToolId; acceptAgreements?: boolean };
export const isSystemToolId = (value: unknown): value is SystemToolId => SYSTEM_TOOL_IDS.includes(value as SystemToolId);
export const systemToolDownloadUrl = (id: SystemToolId, platform: string): string =>
  id === 'git-lfs'
    ? 'https://git-lfs.com/'
    : id === 'github-cli'
      ? 'https://cli.github.com/'
      : `https://git-scm.com/install/${platform === 'win32' ? 'windows' : platform === 'darwin' ? 'mac' : platform === 'linux' ? 'linux' : ''}`;
export const systemToolInstructionsUrl = (id: SystemToolId, platform: string): string =>
  id === 'github-cli'
    ? `https://github.com/cli/cli/blob/trunk/docs/install_${platform === 'win32' ? 'windows' : platform === 'darwin' ? 'macos' : 'linux'}.md`
    : id === 'git-lfs'
      ? 'https://github.com/git-lfs/git-lfs#installation'
      : systemToolDownloadUrl(id, platform);
