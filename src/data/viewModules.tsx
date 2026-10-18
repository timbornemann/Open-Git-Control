import { preloadable } from './preloadableView';

export const viewModules = {
  editor: preloadable(async () => ({ default: (await import('@/components/working-directory/WorkingDirectoryCodeEditor')).WorkingDirectoryCodeEditor })),
  repo: preloadable(async () => ({ default: (await import('@/components/commit-graph')).CommitGraph })),
  file: preloadable(async () => ({ default: (await import('@/components/file-viewer/FileViewer')).FileViewer })),
  timeline: preloadable(async () => ({ default: (await import('@/components/FileTimelineView')).FileTimelineView })),
  planner: preloadable(async () => ({ default: (await import('@/components/project-planner')).ProjectPlannerView })),
  analytics: preloadable(async () => ({ default: (await import('@/components/repository-analytics/RepositoryAnalyticsView')).RepositoryAnalyticsView })),
  hosting: preloadable(async () => ({ default: (await import('@/components/hosting/HostingWorkspace')).HostingWorkspace })),
  release: preloadable(async () => ({ default: (await import('@/components/release-creator/RepositoryReleaseCreator')).RepositoryReleaseCreator })),
  settings: preloadable(async () => ({ default: (await import('@/components/layout/SettingsMainContent')).SettingsMainContent })),
};

export function getViewModule(name: string) {
  if (name === 'github') return viewModules.hosting;
  return Object.prototype.hasOwnProperty.call(viewModules, name) ? viewModules[name as keyof typeof viewModules] : undefined;
}

export function preloadViewModule(name: string): Promise<void> {
  return (
    getViewModule(name)
      ?.preload()
      .catch(() => {}) ?? Promise.resolve()
  );
}
