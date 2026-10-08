import type { HostingOperations } from '../../src/shared/ipc/contracts/hosting';
import type { HostedRepository, HostedRepositoryRef, HostingCapabilities, HostingConnection, HostingReleaseAsset } from '../../src/types/hostingDtos';

export interface ProviderCredential {
  accessToken: string;
  authType: 'token' | 'oauth';
  username?: string;
  email?: string;
}
export type CredentialGetter = () => Promise<ProviderCredential>;
type Input<K extends keyof HostingOperations> = HostingOperations[K]['input'];
type Output<K extends keyof HostingOperations> = HostingOperations[K]['output'];
export interface HostingAdapter {
  authenticate(): Promise<{ id: string; username: string; serverVersion?: string }>;
  capabilities(repository?: HostedRepositoryRef, targetBranch?: string): Promise<HostingCapabilities>;
  resolveRepository(url: string): Promise<HostedRepository | null>;
  resolveCachedRepository(url: string, repositories: HostedRepository[]): HostedRepository | null;
  repositories(input: Input<'repositories'>): Promise<Output<'repositories'>>;
  repository(input: Input<'repository'>): Promise<Output<'repository'>>;
  createRepository(input: Input<'createRepository'>): Promise<Output<'createRepository'>>;
  creationTargets(input: Input<'creationTargets'>): Promise<Output<'creationTargets'>>;
  verifyCreationTarget(input: Input<'verifyCreationTarget'>): Promise<Output<'verifyCreationTarget'>>;
  setDefaultBranch(repository: HostedRepositoryRef, branch: string): Promise<void>;
  fork(input: Input<'fork'>): Promise<Output<'fork'>>;
  branches(input: Input<'branches'>): Promise<Output<'branches'>>;
  tags(input: Input<'tags'>): Promise<Output<'tags'>>;
  changeRequests(input: Input<'changeRequests'>): Promise<Output<'changeRequests'>>;
  createChangeRequest(input: Input<'createChangeRequest'>): Promise<Output<'createChangeRequest'>>;
  merge(input: Input<'merge'>): Promise<Output<'merge'>>;
  runs(input: Input<'runs'>): Promise<Output<'runs'>>;
  jobs(input: Input<'jobs'>): Promise<Output<'jobs'>>;
  status(input: Input<'status'>): Promise<Output<'status'>>;
  logs(input: Input<'logs'>): Promise<Output<'logs'>>;
  artifacts(input: Input<'artifacts'>): Promise<Output<'artifacts'>>;
  downloadArtifact(input: Input<'downloadArtifact'>): Promise<Uint8Array>;
  dispatch(input: Input<'dispatch'>): Promise<true>;
  cancelRun(input: Input<'cancelRun'>): Promise<true>;
  retryRun(input: Input<'retryRun'>): Promise<true>;
  releases(input: Input<'releases'>): Promise<Output<'releases'>>;
  releaseAssets(input: Input<'releaseAssets'>): Promise<Output<'releaseAssets'>>;
  createRelease(input: Input<'createRelease'>): Promise<Output<'createRelease'>>;
  uploadAsset(input: Input<'uploadAsset'>, data: Uint8Array): Promise<HostingReleaseAsset>;
}
export type HostingAdapterFactory = (connection: HostingConnection, credentials: CredentialGetter) => HostingAdapter;
