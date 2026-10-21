import type { HostingProvider } from './hostingDtos';

export type PlannerProjectKind = 'repository' | 'planned';
export type PlannerPriority = 'low' | 'medium' | 'high' | 'urgent';
export type PlannerStatus = 'idea' | 'bug' | 'planned' | 'in-progress' | 'blocked' | 'done';

export type PlannerRepositoryReference = {
  provider: HostingProvider;
  server: string;
  repositoryId: string;
  fullPath: string;
};
export type PlannerBranchReference = {
  id: string;
  projectId: string;
  name: string;
  baseRef: string;
  previousNames?: string[];
  baseSha: string;
  startedAt: number;
  automationPaused: boolean;
  repository?: PlannerRepositoryReference;
  completedBy?: string;
};
export type PlannerChangeRequestReference = PlannerRepositoryReference & {
  workflowId: string;
  id: string;
  number: string;
  url: string;
};
export type PlannerItemReferences = {
  activeWorkflowId?: string;
  branches: PlannerBranchReference[];
  pullRequests: PlannerChangeRequestReference[];
};

export interface PlannerProject {
  id: string;
  name: string;
  description: string;
  kind: PlannerProjectKind;
  repoPath: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface PlannerItem {
  id: string;
  projectId: string;
  title: string;
  description: string;
  priority: PlannerPriority;
  status: PlannerStatus;
  tags: string[];
  references?: PlannerItemReferences;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectPlannerData {
  version: 1;
  projects: PlannerProject[];
  items: PlannerItem[];
}

export type PlannerItemInput = Pick<PlannerItem, 'title' | 'description' | 'priority' | 'status' | 'tags'> & { expectedUpdatedAt?: number };

export type PlannerProjectInput = {
  name: string;
  description: string;
};
