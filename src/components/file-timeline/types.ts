export type FileTimelineStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'unchanged';

export type FileTimelineNode = {
  name: string;
  path: string;
  type: 'file' | 'folder';
  status: FileTimelineStatus;
  children?: Map<string, FileTimelineNode>;
};

export type FileTimelineCommit = {
  hash: string;
  author: string;
  date: string;
  subject: string;
  changes: Array<{
    status: Exclude<FileTimelineStatus, 'unchanged'>;
    path: string;
    oldPath?: string;
  }>;
};

export type FileTimelineDimensions = {
  width: number;
  height: number;
};

export type FileTimelineViewport = {
  scale: number;
  translateX: number;
  translateY: number;
};

export type FileTimelineLayoutNode = {
  name: string;
  path: string;
  type: 'file' | 'folder';
  status: FileTimelineStatus;
  x: number;
  y: number;
  width: number;
  children: FileTimelineLayoutNode[];
  hasChildren: boolean;
  isCollapsed: boolean;
};
