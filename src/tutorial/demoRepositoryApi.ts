import type { ElectronFlatAPI } from '@/shared/ipc/contracts/electronApi';
import type { TutorialStep } from '@/shared/tutorial/types';
import type { StoredRepoData } from '@/types/appDtos';
import type { RepositoryIconStateDto } from '@/shared/repositoryIcons';
import { buildLicenseDocuments, buildOpenGitControlReadme } from '@/shared/licenseTemplates';
import { selectPracticeDirectory } from './TutorialDirectoryPicker';
import { DEMO_REPO, DEMO_SECOND_REPO, DEMO_NEW_REPO, DEMO_CLONE_REPO, DEMO_TIME, ok, unavailable, type DemoRepository } from './demoRepository';

const SAMPLE_IMAGE =
  'data:image/svg+xml;base64,' +
  btoa(
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="12" fill="#366aab"/><text x="32" y="39" text-anchor="middle" font-family="sans-serif" font-size="22" fill="white">OGC</text></svg>',
  );
export const PRACTICE_CLONE_URL = 'https://git.example.invalid/lernen/OGC-Kopie.git';
export function createDemoRepositoryApi(repo: DemoRepository, step: TutorialStep) {
  const setup = step.prepare?.repositories;
  repo.registerProject(DEMO_SECOND_REPO, { 'README.md': '# Notizbuch\n\nEin zweites Beispielprojekt.\n', 'notes.md': '# Notizen\n' }, true);
  if (setup?.initialized)
    repo.registerProject(
      DEMO_NEW_REPO,
      {
        'README.md': buildOpenGitControlReadme('Neues-Projekt'),
        ...Object.fromEntries(
          buildLicenseDocuments('GPL-3.0-only', {
            copyrightHolder: 'Alex Beispiel',
            programName: 'OGC-Testprogramm',
            programDescription: 'Ein Lernprojekt',
            year: 2026,
          }).map((document) => [document.path, document.content]),
        ),
      },
      false,
    );
  if (setup?.cloned) repo.registerProject(DEMO_CLONE_REPO, { 'README.md': '# OGC-Kopie\n\nEin simuliertes geklontes Projekt.\n' }, true);
  const active =
    setup?.active === 'second' ? DEMO_SECOND_REPO : setup?.active === 'new' ? DEMO_NEW_REPO : setup?.active === 'clone' ? DEMO_CLONE_REPO : DEMO_REPO;
  if (active !== DEMO_REPO) repo.selectProject(active);
  repo.events.clear();
  const paths = setup?.entries === 'one' ? [DEMO_REPO] : [DEMO_REPO, DEMO_SECOND_REPO];
  if (setup?.initialized) paths.push(DEMO_NEW_REPO);
  if (setup?.cloned) paths.push(DEMO_CLONE_REPO);
  const stored: StoredRepoData = {
    revision: 1,
    repos: paths.map((path) => ({ path, pinned: path === DEMO_REPO && Boolean(setup?.pinned), lastOpened: DEMO_TIME, createdAt: DEMO_TIME })),
    activeRepo: active,
    sortBy: 'nameAsc',
  };
  const icons = new Map<string, RepositoryIconStateDto>();
  function icon(path: string) {
    if (!icons.has(path))
      icons.set(path, {
        repoPath: path,
        mode: setup?.iconMode || 'initials',
        manualPath: setup?.iconMode === 'manual' ? 'assets/ogc.svg' : null,
        selectionVersion: 'demo-icon-1',
        revision: 1,
        thumbnail: setup?.iconMode && setup.iconMode !== 'initials' ? { path: 'assets/ogc.svg', version: 'demo-source', dataUrl: SAMPLE_IMAGE } : null,
        candidates: ['assets/ogc.svg'],
        limited: false,
        status: 'ready',
        error: null,
      });
    return structuredClone(icons.get(path)!);
  }
  const methods: Partial<ElectronFlatAPI> = {
    getStoredRepos: async () => structuredClone(stored),
    mutateStoredRepos: async (mutation) => {
      if (mutation.kind === 'metadata') {
        const entry = stored.repos.find((item) => item.path === mutation.path);
        if (entry) Object.assign(entry, mutation);
        if (mutation.pinned !== undefined) repo.mark(mutation.pinned ? 'repo-pinned' : 'repo-unpinned');
      }
      if (mutation.kind === 'sort') {
        stored.sortBy = mutation.sortBy;
        repo.mark('repo-sorted');
      }
      if (mutation.kind === 'activate') stored.activeRepo = mutation.path;
      if (mutation.kind === 'remove') {
        stored.repos = stored.repos.filter((entry) => entry.path !== mutation.path);
        repo.mark('repo-removed');
      }
      if (mutation.kind === 'add' && !stored.repos.some((entry) => entry.path === mutation.path))
        stored.repos.push({ path: mutation.path, pinned: false, lastOpened: DEMO_TIME, createdAt: DEMO_TIME });
      stored.revision = (stored.revision || 0) + 1;
      return ok(structuredClone(stored));
    },
    resolveRepoPath: async (path) => {
      if (!repo.hasProject(path)) throw new Error('Unknown practice repository.');
      return path;
    },
    openDirectory: async () => {
      const path = await selectPracticeDirectory(setup?.directory === 'empty' ? DEMO_NEW_REPO : DEMO_REPO);
      if (!path) return null;
      repo.mark('repo-opened');
      return { path, isRepo: repo.hasProject(path) };
    },
    selectDirectory: async () => DEMO_REPO,
    selectProjectParentDirectory: async () => selectPracticeDirectory('/tutorial'),
    gitInit: async (path, options) => {
      if (path !== DEMO_NEW_REPO || repo.hasProject(path)) return { success: false, error: 'Only the empty practice folder can be initialized.' };
      const files: Record<string, string> = {};
      if (options?.createReadme) files['README.md'] = buildOpenGitControlReadme('Neues-Projekt');
      try {
        if (options?.license && options.license !== 'none')
          for (const document of buildLicenseDocuments(options.license, { ...options, year: 2026 })) files[document.path] = document.content;
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
      repo.registerProject(path, files, false);
      repo.mark('repo-initialized');
      return { success: true, createdFiles: Object.keys(files) };
    },
    gitClone: async (url, targetDir, targetName) => {
      if (url !== PRACTICE_CLONE_URL || targetDir !== '/tutorial' || (targetName && targetName !== 'OGC-Kopie'))
        return { success: false, repoPath: '', error: 'Use the sample URL and practice folder shown in this lesson.' };
      repo.emitChannel('clone', 'Cloning into OGC-Kopie (simulated)');
      repo.registerProject(DEMO_CLONE_REPO, { 'README.md': '# OGC-Kopie\n\nEin simuliertes geklontes Projekt.\n' }, true);
      repo.emitChannel('clone', 'Receiving objects: 100% (sample data)');
      repo.mark('repo-cloned');
      return { success: true, repoPath: DEMO_CLONE_REPO };
    },
    onCloneProgress: (callback) => repo.subscribeChannel('clone', (value) => callback(String(value))),
    openRepositoryPath: async ({ repoPath }) => {
      if (!repoPath || !repo.hasProject(repoPath)) return { success: false, error: 'Unknown practice folder.' };
      repo.lastOpenedPath = repoPath;
      repo.mark('folder-opened');
      return { success: true };
    },
    writeClipboardText: async (text) => {
      repo.clipboard = text;
      repo.mark('clipboard-copied');
      return { success: true };
    },
    openExternalUrl: async (url) => {
      try {
        if (new URL(url).hostname !== 'git.example.invalid') return unavailable();
      } catch {
        return unavailable();
      }
      repo.lastOpenedUrl = url;
      repo.mark('external-opened');
      return { success: true };
    },
    getRepositoryIcon: async (path, rescan) => {
      if (rescan) repo.mark('repo-icon-scanned');
      return ok(icon(path));
    },
    saveRepositoryIconChoice: async (path, choice) => {
      if (choice.mode === 'manual' && choice.path !== 'assets/ogc.svg') return { success: false, error: 'Use the sample image.' };
      const state = icon(path);
      if (choice.expectedSelectionVersion !== state.selectionVersion) return { success: false, error: 'Reload the practice icon.' };
      state.mode = choice.mode;
      state.manualPath = choice.mode === 'manual' ? choice.path || null : null;
      state.revision++;
      state.selectionVersion = `demo-icon-${state.revision}`;
      state.thumbnail = choice.mode === 'initials' ? null : state.thumbnail || { path: 'assets/ogc.svg', version: 'demo-source', dataUrl: SAMPLE_IMAGE };
      icons.set(path, state);
      repo.mark('repo-icon-saved');
      return ok(structuredClone(state));
    },
    readRepositoryIconSource: async (_path, file) =>
      file === 'assets/ogc.svg'
        ? ok({ path: file, version: 'demo-source', dataUrl: SAMPLE_IMAGE, mtimeMs: DEMO_TIME, bytes: 200 })
        : { success: false, error: 'Use the sample image.' },
    selectRepositoryIconFile: async () => {
      repo.mark('repo-icon-browsed');
      return ok('assets/ogc.svg');
    },
    cacheRepositoryIconThumbnail: async (path, request) => {
      const state = icon(path);
      state.thumbnail = { path: request.path, version: request.sourceVersion, dataUrl: request.dataUrl };
      icons.set(path, state);
      return ok(state);
    },
  };
  return { stored, methods };
}
