import type { ElectronHostingAPI, HostingOperation, HostingOperations } from '@/shared/ipc/contracts/hosting';
import type { HostedRepository, HostingCapabilities, HostingChangeRequest, HostingConnection } from '@/types/hostingDtos';
import { DEMO_URL, DEMO_TIME, ok, unavailable, type DemoRepository } from './demoRepository';

export const DEMO_CAPABILITIES: HostingCapabilities = {
  createRepository: true,
  fork: true,
  defaultBranchOnlyFork: false,
  changeRequests: true,
  changeRequestLabel: 'Pull Requests',
  mergeMethods: ['merge', 'squash'],
  ciLabel: 'Actions',
  runs: true,
  jobs: true,
  steps: true,
  logs: true,
  artifacts: true,
  cancelRun: true,
  retryRun: true,
  dispatch: true,
  releases: 'native',
  releaseAssets: true,
  draftRelease: true,
  prerelease: true,
};
export const DEMO_CONNECTION: HostingConnection = {
  id: 'demo-hosting',
  provider: 'github',
  label: 'Lernkonto / Practice account',
  baseUrl: 'https://git.example.invalid',
  apiBaseUrl: 'https://git.example.invalid/api',
  username: 'alex-beispiel',
  userId: 'demo-user',
  authenticated: true,
  hasCredentials: true,
};
export const DEMO_HOSTED_REPO: HostedRepository = {
  ref: { connectionId: 'demo-hosting', repositoryId: 'demo-project', fullPath: 'lernen/OGC-Lernprojekt' },
  name: 'OGC-Lernprojekt',
  fullName: 'lernen/OGC-Lernprojekt',
  private: false,
  cloneUrl: DEMO_URL,
  htmlUrl: 'https://git.example.invalid/lernen/OGC-Lernprojekt',
  description: 'Ein Lernprojekt mit Beispieldaten / A project with sample data',
  defaultBranch: 'main',
  fork: false,
  updatedAt: new Date(DEMO_TIME).toISOString(),
  capabilities: DEMO_CAPABILITIES,
};

export function createDemoHostingApi(repo: DemoRepository): ElectronHostingAPI {
  const date = new Date(DEMO_TIME).toISOString();
  const changes: HostingChangeRequest[] = [
    {
      id: 'pr-1',
      number: '1',
      title: 'Eine freundliche Begrüßung / Add a friendly welcome',
      body: 'Diese Beispieländerung ergänzt eine Begrüßung. / This sample change adds a welcome.',
      state: 'open',
      author: 'alex-beispiel',
      source: DEMO_HOSTED_REPO.ref,
      sourceBranch: 'feature/begruessung',
      headSha: repo.commits[0].hash,
      target: DEMO_HOSTED_REPO.ref,
      targetBranch: 'main',
      draft: false,
      htmlUrl: `${DEMO_HOSTED_REPO.htmlUrl}/pull/1`,
      createdAt: date,
      updatedAt: date,
    },
  ];
  const page = <T>(items: T[]) => ({ items, nextCursor: null });
  const handlers: { [K in HostingOperation]?: (input: HostingOperations[K]['input']) => HostingOperations[K]['output'] } = {
    connections: () => [DEMO_CONNECTION],
    capabilities: () => DEMO_CAPABILITIES,
    repositories: () => page([DEMO_HOSTED_REPO]),
    cachedRepositories: () => page([DEMO_HOSTED_REPO]),
    repository: () => {
      repo.mark('hosting-inspected');
      return DEMO_HOSTED_REPO;
    },
    resolveRepository: () => DEMO_HOSTED_REPO,
    branches: () => page(repo.branches),
    tags: () => page(repo.tags),
    changeRequests: () => {
      repo.mark('hosting-inspected');
      return page(changes);
    },
    createChangeRequest: (input) => {
      const entry: HostingChangeRequest = {
        ...changes[0],
        id: `pr-${changes.length + 1}`,
        number: String(changes.length + 1),
        title: input.title,
        body: input.body,
        sourceBranch: input.sourceBranch,
        targetBranch: input.targetBranch,
      };
      changes.push(entry);
      repo.mark('pr-created');
      return entry;
    },
    merge: (input) => {
      const change = changes.find((entry) => entry.id === input.id);
      if (change) change.state = 'merged';
      repo.mark('pr-merged');
      return { merged: true, message: 'Merged in the exercise.', sha: repo.commits[0].hash };
    },
    status: () => ({
      sha: repo.commits[0].hash,
      state: 'success',
      checks: [{ id: 'tests', name: 'Tests', status: 'success', htmlUrl: null, description: '3 tests passed' }],
    }),
    runs: () =>
      page([
        {
          id: 'run-1',
          number: '12',
          name: 'Tests',
          status: 'completed',
          conclusion: 'success',
          branch: 'main',
          headSha: repo.commits[0].hash,
          event: 'push',
          htmlUrl: `${DEMO_HOSTED_REPO.htmlUrl}/actions/12`,
          createdAt: date,
          updatedAt: date,
        },
      ]),
    jobs: () =>
      page([
        {
          id: 'job-1',
          name: 'Unit tests',
          status: 'completed',
          conclusion: 'success',
          htmlUrl: DEMO_HOSTED_REPO.htmlUrl,
          steps: [{ id: 'test', name: 'Run tests', status: 'completed', conclusion: 'success' }],
        },
      ]),
    logs: () => ({ text: '✓ greeting.test.ts (3 tests)\n3 passed\n', truncated: false, nextCursor: null }),
    artifacts: () => page([]),
    releases: () =>
      page([
        {
          id: 'release-1',
          tagName: 'v1.0.0',
          name: 'Unser erster Stand / Our first version',
          body: 'Ein funktionierendes Lernprojekt. / A working learning project.',
          publishedAt: date,
          htmlUrl: `${DEMO_HOSTED_REPO.htmlUrl}/releases/v1.0.0`,
          draft: false,
          prerelease: false,
        },
      ]),
    releaseAssets: () => page([]),
    inspectRelease: () => ({
      inspectionId: 'demo-inspection',
      localSha: repo.commits[0].hash,
      remoteSha: repo.commits[0].hash,
      ahead: 0,
      behind: 0,
      canPush: true,
      canReleaseRemote: true,
      pushBlockedReason: null,
    }),
    createRelease: (input) => {
      repo.tags.push(input.tagName);
      repo.mark('release-created');
      return {
        id: 'release-2',
        tagName: input.tagName,
        name: input.name,
        body: input.body,
        htmlUrl: DEMO_HOSTED_REPO.htmlUrl,
        draft: Boolean(input.draft),
        prerelease: Boolean(input.prerelease),
      };
    },
    releaseNotesCommits: () => repo.commits.map((commit) => ({ sha: commit.hash, message: commit.subject, author: 'Alex Beispiel', date: commit.date })),
    releaseContext: () => ({
      existingTags: repo.tags,
      lastReleaseTag: 'v1.0.0',
      repositoryHtmlUrl: DEMO_HOSTED_REPO.htmlUrl,
      commitsSinceLastRelease: repo.commits.map((commit) => ({
        hash: commit.hash,
        shortHash: commit.hash.slice(0, 7),
        subject: commit.subject,
        author: 'Alex Beispiel',
        date: commit.date,
      })),
      commitsTarget: repo.branch,
      targetOid: repo.commits[0].hash,
      fallbackUsed: false,
    }),
    localWorkflows: () => ({
      provider: 'github',
      workflows: [{ id: 'tests', name: 'Tests', filePath: '.github/workflows/test.yml' }],
      files: ['.github/workflows/test.yml'],
      issues: [],
    }),
    login: () => DEMO_CONNECTION,
    loginBrowser: () => DEMO_CONNECTION,
    saveConnection: () => DEMO_CONNECTION,
    logout: () => true,
    removeConnection: () => true,
    cancelAuth: () => true,
    dispatch: () => {
      repo.mark('ci-dispatched');
      return true;
    },
    cancelRun: () => true,
    retryRun: () => true,
  };
  return {
    hostingRequest: async <K extends HostingOperation>(operation: K, input: HostingOperations[K]['input']) => {
      const handler = handlers[operation];
      return handler ? ok(handler(input)) : unavailable();
    },
  };
}
