import type { HostedRepository, HostingRepositoryCreation, HostingPage } from './hostingDtos';
import type { GitRemoteSnapshotDto } from './remoteTransfers';

export interface HostingCreationTarget {
  id: string;
  namespace: string;
  label: string;
  kind: 'personal' | 'organization' | 'group' | 'workspace' | 'project';
  projectKey?: string;
  parent?: string;
  visibility: Array<'private' | 'public'>;
}
export interface HostingCreationTargets extends HostingPage<HostingCreationTarget> {
  requiresProject: boolean;
  allowsManual: boolean;
}
export interface PublicationBranch {
  sourceBranch: string;
  destinationBranch: string;
  sourceOid: string;
}
export interface PublicationTag {
  name: string;
  oid: string;
}
export interface PublicationSelection {
  repoPath: string;
  creation: HostingRepositoryCreation;
  remoteName: string;
  transport: 'https' | 'ssh';
  credentialMode: 'connection' | 'system';
  makePrimary: boolean;
  branches: Array<{ sourceBranch: string; destinationBranch: string }>;
  tagNames: string[];
}
export type PublicationStage = 'prepared' | 'creating' | 'uncertain' | 'created' | 'connected' | 'uploaded' | 'setup-pending' | 'complete';
export interface RepositoryPublication {
  id: string;
  selection: PublicationSelection;
  branches: PublicationBranch[];
  tags: PublicationTag[];
  commitCount?: number;
  stage: PublicationStage;
  repository?: HostedRepository;
  candidate?: HostedRepository;
  remoteUrl?: string;
  message?: string;
  createdAt: string;
  updatedAt: string;
}
export interface PublicationContext {
  snapshot: GitRemoteSnapshotDto;
  branches: Array<{ name: string; oid: string }>;
  tags: PublicationTag[];
  dirtyFiles: number;
  publications: RepositoryPublication[];
}
