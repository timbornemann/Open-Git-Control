import type {
  DeviceFlowStartDto,
  DeviceFlowPollDto,
  HostedRepository,
  HostedRepositoryRef,
  HostingArtifact,
  HostingCapabilities,
  HostingChangeRequest,
  HostingConnection,
  HostingConnectionInput,
  HostingCreateChangeRequest,
  HostingCreateRelease,
  HostingDispatch,
  HostingForkRequest,
  HostingJob,
  HostingLog,
  HostingLocalWorkflows,
  HostingMergeRequest,
  HostingPage,
  HostingRelease,
  HostingReleaseAsset,
  HostingReleaseTarget,
  HostingRepositoryCreation,
  HostingRun,
  HostingStatus,
} from '../../../types/hostingDtos';
import type { IpcResult } from '../../../types/ipc';
import type { ReleaseContext } from '../../../types/releaseNotes';

export interface HostingOperations {
  connections: { input: undefined; output: HostingConnection[] };
  saveConnection: { input: HostingConnectionInput; output: HostingConnection };
  removeConnection: { input: { connectionId: string }; output: true };
  login: { input: { connectionId: string; token: string; email?: string; username?: string }; output: HostingConnection };
  loginBrowser: { input: { connectionId: string }; output: HostingConnection };
  loginWithCli: { input: { connectionId: string; expectedUsername?: string }; output: HostingConnection };
  inspectCliLogin: { input: { connectionId: string }; output: { username: string; host: string } };
  startDeviceLogin: { input: { connectionId: string }; output: DeviceFlowStartDto };
  pollDeviceLogin: { input: { connectionId: string; deviceCode: string }; output: DeviceFlowPollDto };
  cancelAuth: { input: { connectionId: string }; output: true };
  logout: { input: { connectionId: string }; output: true };
  capabilities: { input: { connectionId: string; repository?: HostedRepositoryRef; targetBranch?: string }; output: HostingCapabilities };
  repositories: { input: { connectionId: string; cursor?: string; search?: string }; output: HostingPage<HostedRepository> };
  cachedRepositories: { input: { connectionId: string }; output: HostingPage<HostedRepository> };
  repository: { input: { repository: HostedRepositoryRef }; output: HostedRepository };
  resolveRepository: { input: { connectionId: string; url: string; cachedOnly?: boolean }; output: HostedRepository | null };
  createRepository: { input: HostingRepositoryCreation; output: HostedRepository };
  clone: { input: { repository: HostedRepositoryRef; targetDir: string; targetName?: string; useSsh?: boolean }; output: { path: string } };
  checkoutChangeRequest: { input: { repoPath: string; repository: HostedRepositoryRef; id: string; expectedHeadSha: string }; output: true };
  fork: { input: HostingForkRequest; output: HostedRepository };
  branches: { input: { repository: HostedRepositoryRef; cursor?: string }; output: HostingPage<string> };
  tags: { input: { repository: HostedRepositoryRef; cursor?: string }; output: HostingPage<string> };
  changeRequests: { input: { repository: HostedRepositoryRef; state?: 'open' | 'closed' | 'all'; cursor?: string }; output: HostingPage<HostingChangeRequest> };
  createChangeRequest: { input: HostingCreateChangeRequest; output: HostingChangeRequest };
  merge: { input: HostingMergeRequest; output: { merged: boolean; message: string; sha?: string } };
  runs: { input: { repository: HostedRepositoryRef; branch?: string; headSha?: string; cursor?: string }; output: HostingPage<HostingRun> };
  localWorkflows: { input: { repository: HostedRepositoryRef; repoPath: string }; output: HostingLocalWorkflows };
  jobs: { input: { repository: HostedRepositoryRef; runId: string; cursor?: string }; output: HostingPage<HostingJob> };
  status: { input: { repository: HostedRepositoryRef; ref: string }; output: HostingStatus };
  logs: { input: { repository: HostedRepositoryRef; runId: string; jobId?: string; cursor?: string }; output: HostingLog };
  artifacts: { input: { repository: HostedRepositoryRef; runId: string; cursor?: string }; output: HostingPage<HostingArtifact> };
  downloadArtifact: { input: { repository: HostedRepositoryRef; runId: string; artifactId: string }; output: { path: string } | null };
  dispatch: { input: HostingDispatch; output: true };
  cancelRun: { input: { repository: HostedRepositoryRef; runId: string }; output: true };
  retryRun: { input: { repository: HostedRepositoryRef; runId: string }; output: true };
  releases: { input: { repository: HostedRepositoryRef; cursor?: string }; output: HostingPage<HostingRelease> };
  releaseAssets: { input: { repository: HostedRepositoryRef; releaseId?: string; cursor?: string }; output: HostingPage<HostingReleaseAsset> };
  releaseNotesCommits: {
    input: { repoPath: string; fromRef?: string; toRef: string };
    output: { sha: string; message: string; description?: string; author?: string; date?: string }[];
  };
  releaseContext: {
    input: { repository: HostedRepositoryRef; repoPath: string; remoteName: string; target: string; fromRef?: string };
    output: ReleaseContext;
  };
  inspectRelease: { input: HostingCreateRelease; output: HostingReleaseTarget };
  createRelease: { input: HostingCreateRelease; output: HostingRelease };
  uploadAsset: {
    input: { repository: HostedRepositoryRef; repoPath: string; releaseId: string; filePath: string; name?: string };
    output: HostingReleaseAsset;
  };
}
export type HostingOperation = keyof HostingOperations;
export interface ElectronHostingAPI {
  hostingRequest: <K extends HostingOperation>(operation: K, input: HostingOperations[K]['input']) => Promise<IpcResult<HostingOperations[K]['output']>>;
}
