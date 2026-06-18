export type PlannerProjectKind = 'repository' | 'planned';
export type PlannerPriority = 'low' | 'medium' | 'high' | 'urgent';
export type PlannerStatus = 'idea' | 'bug' | 'planned' | 'in-progress' | 'blocked' | 'done';

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
  createdAt: number;
  updatedAt: number;
}

export interface ProjectPlannerData {
  version: 1;
  projects: PlannerProject[];
  items: PlannerItem[];
}

export type PlannerItemInput = Pick<
  PlannerItem,
  'title' | 'description' | 'priority' | 'status' | 'tags'
>;

export type PlannerProjectInput = {
  name: string;
  description: string;
};
