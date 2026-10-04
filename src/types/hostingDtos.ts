export type HostingProvider = 'github' | 'forgejo' | 'gitlab' | 'bitbucket-cloud' | 'bitbucket-data-center';

export interface DeviceFlowStartDto {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}
export type DeviceFlowPollDto =
  | { status: 'pending'; interval: number | null }
  | { status: 'error'; error: string; errorDescription: string | null }
  | { status: 'success'; username: string | null; tokenPersisted?: boolean };

export interface HostingOAuthConfig {
  clientId: string;
  redirectUri: string;
  allowHttpLoopback?: boolean;
}

export interface HostingConnection {
  id: string;
  provider: HostingProvider;
  label: string;
  baseUrl: string;
  apiBaseUrl: string;
  username: string | null;
  userId: string | null;
  authenticated: boolean;
  hasCredentials: boolean;
  tokenPersisted?: boolean;
  oauth?: HostingOAuthConfig;
  serverVersion?: string;
}

export interface HostingConnectionInput {
  id?: string;
  provider: HostingProvider;
  label: string;
  baseUrl: string;
  apiBaseUrl?: string;
  oauth?: HostingOAuthConfig;
  clientSecret?: string;
}

export interface HostedRepositoryRef {
  connectionId: string;
  repositoryId: string;
  fullPath: string;
}
export type HostingFeature =
  | 'createRepository'
  | 'fork'
  | 'changeRequests'
  | 'runs'
  | 'jobs'
  | 'steps'
  | 'logs'
  | 'artifacts'
  | 'cancelRun'
  | 'retryRun'
  | 'dispatch'
  | 'releaseAssets'
  | 'draftRelease'
  | 'prerelease';
export type HostingAvailability = 'available' | 'unsupported' | 'disabled' | 'permission' | 'unavailable';

export interface HostingCapabilities {
  availability?: Partial<Record<HostingFeature, HostingAvailability>>;
  createRepository: boolean;
  fork: boolean;
  defaultBranchOnlyFork: boolean;
  changeRequests: boolean;
  changeRequestLabel: string;
  mergeMethods: string[];
  ciLabel: string;
  runs: boolean;
  jobs: boolean;
  steps: boolean;
  logs: boolean;
  runLogs?: boolean;
  artifacts: boolean;
  cancelRun: boolean;
  retryRun: boolean;
  dispatch: boolean;
  releases: 'native' | 'downloads' | 'tags';
  releaseAssets: boolean;
  draftRelease: boolean;
  prerelease: boolean;
  reason?: string;
}

export interface HostedRepository {
  ref: HostedRepositoryRef;
  name: string;
  fullName: string;
  private: boolean;
  cloneUrl: string;
  sshUrl?: string;
  htmlUrl: string;
  description: string | null;
  defaultBranch: string;
  fork: boolean;
  parent?: HostedRepositoryRef | null;
  updatedAt?: string;
  capabilities?: HostingCapabilities;
}

export interface HostingPage<T> {
  items: T[];
  nextCursor: string | null;
  stale?: boolean;
}
export interface HostingRepositoryCreation {
  connectionId: string;
  namespace?: string;
  name: string;
  description?: string;
  private: boolean;
  initializeReadme?: boolean;
  readmeContent?: string;
}
export interface HostingForkRequest {
  repository: HostedRepositoryRef;
  namespace?: string;
  name?: string;
  defaultBranchOnly?: boolean;
}

export interface HostingChangeRequest {
  id: string;
  number: string;
  title: string;
  body?: string;
  state: 'open' | 'closed' | 'merged';
  author: string;
  source: HostedRepositoryRef;
  sourceBranch: string;
  headSha: string;
  target: HostedRepositoryRef;
  targetBranch: string;
  draft: boolean;
  htmlUrl: string;
  createdAt: string;
  updatedAt: string;
  version?: number;
}
export interface HostingCreateChangeRequest {
  repository: HostedRepositoryRef;
  source: HostedRepositoryRef;
  sourceBranch: string;
  targetBranch: string;
  title: string;
  body: string;
}
export interface HostingMergeRequest {
  repository: HostedRepositoryRef;
  id: string;
  method: string;
  expectedHeadSha: string;
  version?: number;
}

export interface HostingRun {
  id: string;
  number?: string;
  name: string;
  workflowId?: string;
  workflowName?: string;
  status: string;
  conclusion: string | null;
  branch: string;
  headSha: string;
  event: string;
  htmlUrl: string;
  createdAt: string;
  updatedAt: string;
}
export interface HostingStep {
  id: string;
  name: string;
  status: string;
  conclusion: string | null;
}
export interface HostingJob {
  id: string;
  name: string;
  status: string;
  conclusion: string | null;
  htmlUrl: string;
  steps: HostingStep[];
}
export interface HostingCheck {
  id: string;
  name: string;
  status: string;
  htmlUrl: string | null;
  description?: string;
}
export interface HostingStatus {
  sha: string;
  state: string;
  checks: HostingCheck[];
}
export interface HostingLog {
  text: string;
  truncated: boolean;
  nextCursor: string | null;
}
export interface HostingArtifact {
  id: string;
  name: string;
  size?: number;
  expiresAt?: string | null;
  htmlUrl?: string;
  downloadable: boolean;
}
export interface HostingDispatch {
  repository: HostedRepositoryRef;
  workflow: string;
  ref: string;
  inputs?: Record<string, string>;
}

export interface HostingRelease {
  id: string;
  tagName: string;
  name: string;
  body?: string;
  htmlUrl: string;
  draft: boolean;
  prerelease: boolean;
}
export interface HostingCreateRelease {
  repository: HostedRepositoryRef;
  repoPath: string;
  remoteName: string;
  tagName: string;
  name: string;
  body: string;
  target: string;
  draft?: boolean;
  prerelease?: boolean;
  inspectionId?: string;
  mode?: 'remote' | 'push-local';
}
export interface HostingReleaseTarget {
  inspectionId: string;
  localSha: string | null;
  remoteSha: string | null;
  ahead: number;
  behind: number;
  canPush: boolean;
  canReleaseRemote: boolean;
  pushBlockedReason: string | null;
}
export interface HostingReleaseAsset {
  id: string;
  name: string;
  htmlUrl: string;
}
export interface RepositoryEndpoint {
  remoteName: string;
  url: string;
  repository: HostedRepositoryRef | null;
  credentialMode?: 'hosting' | 'system';
}
