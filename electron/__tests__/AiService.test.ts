import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiService, buildFallbackCommitMessage, buildStructuredDiffContext, parseStatusPorcelain } from '../AiService';
import { AppSettings } from '../settings';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const baseSettings: AppSettings = {
  theme: 'dark',
  language: 'de',
  autoFetchIntervalMs: 60_000,
  defaultBranch: 'main',
  confirmDangerousOps: true,
  commitTemplate: '',
  showSecondaryHistory: true,
  commitSignoffByDefault: false,
  autoUpdateEnabled: true,
  secretScanBeforePushEnabled: true,
  secretScanStrictness: 'medium',
  secretScanAllowlist: '',
  aiAutoCommitEnabled: true,
  aiProvider: 'gemini',
  aiCommitMessageStyle: 'conventional',
  aiCommitMessageLanguage: 'auto',
  ollamaBaseUrl: 'http://127.0.0.1:11434',
  ollamaModel: '',
  geminiModel: 'gemini-1.5-flash',
  hasGeminiApiKey: true,
  githubOauthClientId: '',
  githubHost: 'github.com',
};

const fakeGitService = {
  getRepoPath: () => '/tmp/repo',
  getStatusPorcelain: vi.fn(async () => ''),
  runCommand: vi.fn(async () => ''),
} as any;

const okJsonResponse = (json: unknown) => ({
  ok: true,
  json: async () => json,
  text: async () => JSON.stringify(json),
});

describe('AiService gemini secret access', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('fails when no gemini api key is available', async () => {
    const service = new AiService(fakeGitService);
    await expect(service.testConnection(baseSettings, () => '')).rejects.toThrow('Gemini API key fehlt.');
  });

  it('fails when secure key access throws', async () => {
    const service = new AiService(fakeGitService);
    await expect(service.listModels(baseSettings, () => { throw new Error('secret backend unavailable'); })).rejects.toThrow('secret backend unavailable');
  });

  it('uses secure key when present', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ models: [] }),
    }));
    vi.stubGlobal('fetch', fetchMock as any);

    const service = new AiService(fakeGitService);
    await service.listModels(baseSettings, () => 'secure-key-123');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('key=secure-key-123');
  });
});

describe('AiService release notes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('passes the semantic release classification to the AI prompt', async () => {
    const fetchMock = vi.fn(async (_url: string, init: any) => okJsonResponse({
      candidates: [{
        content: {
          parts: [{ text: '# Release v2.0.0\n\nThis major release adds the new workflow.' }],
        },
      }],
    }));
    vi.stubGlobal('fetch', fetchMock as any);

    const service = new AiService(fakeGitService);
    const markdown = await service.generateReleaseNotes(baseSettings, () => 'secure-key-123', {
      tagName: 'v2.0.0',
      releaseName: 'Release v2.0.0',
      lastReleaseTag: 'v1.4.2',
      commits: [{
        hash: 'abc123',
        shortHash: 'abc123',
        subject: 'feat: add new workflow',
        author: 'Tim',
        date: '2026-06-14',
      }],
      language: 'en',
      versionBump: 'major',
    });

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    const systemPrompt = requestBody.systemInstruction.parts[0].text;
    const userPrompt = requestBody.contents[0].parts[0].text;

    expect(systemPrompt).toContain('semantic version classification');
    expect(userPrompt).toContain('Semantic version change: major');
    expect(userPrompt).toContain('Explicitly call this a major release');
    expect(userPrompt).toContain('breaking changes and migration requirements');
    expect(markdown).toContain('This major release');
  });

  it('names the release type in the deterministic fallback without commits', async () => {
    const service = new AiService(fakeGitService);
    const markdown = await service.generateReleaseNotes(baseSettings, () => '', {
      tagName: 'v1.3.0',
      releaseName: 'Release v1.3.0',
      lastReleaseTag: 'v1.2.4',
      commits: [],
      language: 'de',
      versionBump: 'minor',
    });

    expect(markdown).toContain('Dieses Minor Release');
  });
});

describe('AiService commit message from user notes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('generates a commit message from notes without adding file context', async () => {
    const fetchMock = vi.fn(async (_url: string, init: any) => okJsonResponse({
      message: {
        content: JSON.stringify({
          title: 'feat(settings): add commit message styles',
          description: 'Adds selectable styles for AI-generated commit messages.',
        }),
      },
    }));
    vi.stubGlobal('fetch', fetchMock as any);

    const service = new AiService(fakeGitService);
    const result = await service.generateCommitMessageFromUserNotes(
      { ...baseSettings, aiProvider: 'ollama', ollamaModel: 'test-model', aiCommitMessageStyle: 'conventional' },
      () => '',
      { notes: 'Nutzer kann Commit-Message-Stile in den Settings auswaehlen.' },
    );

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    const systemPrompt = String(requestBody.messages[0].content);
    const userPrompt = String(requestBody.messages[1].content);

    expect(systemPrompt).toContain('Conventional Commits');
    expect(systemPrompt).toContain('Examples: "feat(git): show transfer progress phases"');
    expect(systemPrompt).toContain('Language: auto');
    expect(systemPrompt).toContain('user-supplied change notes only');
    expect(userPrompt).toContain('Nutzer kann Commit-Message-Stile');
    expect(userPrompt).not.toContain('Files in this commit');
    expect(userPrompt).not.toContain('key_change');
    expect(result).toEqual({
      title: 'feat(settings): add commit message styles',
      description: 'Adds selectable styles for AI-generated commit messages.',
    });
  });

  it('uses the configured plain style instruction', async () => {
    const fetchMock = vi.fn(async (_url: string, init: any) => okJsonResponse({
      message: { content: '{"title":"update commit message generator","description":""}' },
    }));
    vi.stubGlobal('fetch', fetchMock as any);

    const service = new AiService(fakeGitService);
    await service.generateCommitMessageFromUserNotes(
      { ...baseSettings, aiProvider: 'ollama', ollamaModel: 'test-model', aiCommitMessageStyle: 'plain' },
      () => '',
      { notes: 'Commit message generator button opens a notes dialog.' },
    );

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(String(requestBody.messages[0].content)).toContain('Style: plain');
  });

  it('uses the selected commit message language for notes generation', async () => {
    const fetchMock = vi.fn(async (_url: string, init: any) => okJsonResponse({
      message: { content: '{"title":"fix(settings): preserve commit language","description":""}' },
    }));
    vi.stubGlobal('fetch', fetchMock as any);

    const service = new AiService(fakeGitService);
    await service.generateCommitMessageFromUserNotes(
      { ...baseSettings, aiProvider: 'ollama', ollamaModel: 'test-model', aiCommitMessageLanguage: 'en' },
      () => '',
      { notes: 'Commit-Sprache soll konstant bleiben.' },
    );

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(String(requestBody.messages[0].content)).toContain('Language: English');
  });
});

describe('AiService porcelain path parsing', () => {
  it('unquotes file paths with spaces', () => {
    const entries = parseStatusPorcelain('?? "Docs/App Overview.png"\n');
    expect(entries).toHaveLength(1);
    expect(entries[0].path).toBe('Docs/App Overview.png');
    expect(entries[0].code).toBe('??');
  });

  it('keeps the destination path for rename entries', () => {
    const entries = parseStatusPorcelain('R  "Docs/Old Name.png" -> "Docs/App Overview.png"\n');
    expect(entries).toHaveLength(1);
    expect(entries[0].path).toBe('Docs/App Overview.png');
    expect(entries[0].code).toBe('R ');
  });

  it('decodes escaped quotes from porcelain output', () => {
    const entries = parseStatusPorcelain('?? "Docs/App \\\"Overview\\\".png"\n');
    expect(entries).toHaveLength(1);
    expect(entries[0].path).toBe('Docs/App "Overview".png');
  });
});

describe('AiService context extraction and prompts', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('includes representative changes from first, middle, and last hunks', () => {
    const diff = [
      'diff --git a/src/app.ts b/src/app.ts',
      'index 1111111..2222222 100644',
      '--- a/src/app.ts',
      '+++ b/src/app.ts',
      '@@ -1,4 +1,4 @@',
      '-const oldFlag = true;',
      '+const oldFlag = false;',
      '@@ -20,4 +20,6 @@',
      '-return loadProfile(userId);',
      '+const profile = await loadProfile(userId);',
      '+trackEvent("profile_loaded");',
      '@@ -80,2 +84,4 @@',
      '-export default App;',
      '+export { App };',
      '+export default App;',
      '',
    ].join('\n');

    const context = buildStructuredDiffContext(diff).join('\n');
    expect(context).toContain('oldFlag = false');
    expect(context).toContain('trackEvent("profile_loaded")');
    expect(context).toContain('export { App }');
  });

  it('uses combined HEAD diff for modified files and avoids staged/unstaged split commands', async () => {
    const commandLog: string[] = [];
    const runCommand = vi.fn(async (args: string[]) => {
      const key = args.join(' ');
      commandLog.push(key);
      if (key === 'diff --numstat HEAD -- src/app.ts') return '5\t2\tsrc/app.ts';
      if (key === 'diff --no-color --unified=3 HEAD -- src/app.ts') {
        return [
          'diff --git a/src/app.ts b/src/app.ts',
          '@@ -1,2 +1,3 @@',
          '-const enabled = false;',
          '+const enabled = true;',
          '+logInfo("enabled");',
        ].join('\n');
      }
      if (args[0] === 'add') return '';
      if (args[0] === 'commit') return '';
      if (key === 'rev-parse --short HEAD') return 'abc1234';
      if (key === 'show -s --format=%s HEAD') return 'chore(src): update 1 file';
      throw new Error(`Unexpected command: ${key}`);
    });

    const service = new AiService({
      getRepoPath: () => '/tmp/repo',
      getStatusPorcelain: vi.fn()
        .mockResolvedValueOnce(' M src/app.ts\n')
        .mockResolvedValueOnce(''),
      runCommand,
    } as any);

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(okJsonResponse({ message: { content: '{"selectedPaths":["src/app.ts"]}' } }))
      .mockResolvedValueOnce(okJsonResponse({ message: { content: '{"title":"chore(src): adjust app behavior","description":""}' } }));
    vi.stubGlobal('fetch', fetchMock as any);

    await service.runAutoCommit(
      { ...baseSettings, aiProvider: 'ollama', ollamaModel: 'test-model' },
      () => '',
    );

    expect(commandLog).toContain('diff --numstat HEAD -- src/app.ts');
    expect(commandLog).toContain('diff --no-color --unified=3 HEAD -- src/app.ts');
    expect(commandLog.some((cmd) => cmd.includes('diff --cached -- src/app.ts'))).toBe(false);
    expect(commandLog.some((cmd) => cmd.includes('diff --numstat -- src/app.ts'))).toBe(false);
  });

  it('uses untracked file content as fallback context when no HEAD diff is available', async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-ai-'));
    const notesDir = path.join(tmpRoot, 'notes');
    fs.mkdirSync(notesDir, { recursive: true });
    fs.writeFileSync(
      path.join(notesDir, 'todo.txt'),
      [
        'implement onboarding checklist',
        'track completion events',
        'add reminder email copy',
      ].join('\n'),
      'utf8',
    );

    const runCommand = vi.fn(async (args: string[]) => {
      const key = args.join(' ');
      if (key === 'diff --numstat HEAD -- notes/todo.txt') return '';
      if (key === 'diff --no-color --unified=3 HEAD -- notes/todo.txt') return '';
      if (args[0] === 'add') return '';
      if (args[0] === 'commit') return '';
      if (key === 'rev-parse --short HEAD') return 'def5678';
      if (key === 'show -s --format=%s HEAD') return 'chore(notes): add 1 file';
      throw new Error(`Unexpected command: ${key}`);
    });

    const service = new AiService({
      getRepoPath: () => tmpRoot,
      getStatusPorcelain: vi.fn()
        .mockResolvedValueOnce('?? notes/todo.txt\n')
        .mockResolvedValueOnce(''),
      runCommand,
    } as any);

    let choosePrompt = '';
    const fetchMock = vi.fn(async (_url: string, init: any) => {
      const body = JSON.parse(String(init?.body || '{}'));
      const userPrompt = String(body?.messages?.[1]?.content || '');
      if (!choosePrompt) {
        choosePrompt = userPrompt;
        return okJsonResponse({ message: { content: '{"selectedPaths":["notes/todo.txt"]}' } });
      }
      return okJsonResponse({ message: { content: '{"title":"chore(notes): add onboarding todo","description":""}' } });
    });
    vi.stubGlobal('fetch', fetchMock as any);

    await service.runAutoCommit(
      { ...baseSettings, aiProvider: 'ollama', ollamaModel: 'test-model' },
      () => '',
    );

    expect(choosePrompt).toContain('implement onboarding checklist');
  });

  it('builds commit-message prompt with multi-file context and full-batch rule', async () => {
    const runCommand = vi.fn(async (args: string[]) => {
      const key = args.join(' ');
      if (key === 'diff --numstat HEAD -- src/app.ts') return '10\t2\tsrc/app.ts';
      if (key === 'diff --numstat HEAD -- src/auth.ts') return '8\t4\tsrc/auth.ts';
      if (key === 'diff --no-color --unified=3 HEAD -- src/app.ts') {
        return ['diff --git a/src/app.ts b/src/app.ts', '@@ -1 +1 @@', '-old', '+new app flow'].join('\n');
      }
      if (key === 'diff --no-color --unified=3 HEAD -- src/auth.ts') {
        return ['diff --git a/src/auth.ts b/src/auth.ts', '@@ -1 +1 @@', '-old', '+new auth guard'].join('\n');
      }
      if (args[0] === 'add') return '';
      if (args[0] === 'commit') return '';
      if (key === 'rev-parse --short HEAD') return '111aaaa';
      if (key === 'show -s --format=%s HEAD') return 'chore(src): update 2 files';
      throw new Error(`Unexpected command: ${key}`);
    });

    const service = new AiService({
      getRepoPath: () => '/tmp/repo',
      getStatusPorcelain: vi.fn()
        .mockResolvedValueOnce(' M src/app.ts\n M src/auth.ts\n')
        .mockResolvedValueOnce(''),
      runCommand,
    } as any);

    let commitSystemPrompt = '';
    let commitUserPrompt = '';
    let callCount = 0;
    const fetchMock = vi.fn(async (_url: string, init: any) => {
      callCount += 1;
      const body = JSON.parse(String(init?.body || '{}'));
      const systemPrompt = String(body?.messages?.[0]?.content || '');
      const userPrompt = String(body?.messages?.[1]?.content || '');

      if (callCount === 1) {
        return okJsonResponse({ message: { content: '{"selectedPaths":["src/app.ts","src/auth.ts"]}' } });
      }

      commitSystemPrompt = systemPrompt;
      commitUserPrompt = userPrompt;
      return okJsonResponse({ message: { content: '{"title":"chore(src): align app and auth flow","description":"Keeps behavior consistent across app and auth."}' } });
    });
    vi.stubGlobal('fetch', fetchMock as any);

    await service.runAutoCommit(
      { ...baseSettings, aiProvider: 'ollama', ollamaModel: 'test-model' },
      () => '',
    );

    expect(commitSystemPrompt).toContain('full batch');
    expect(commitUserPrompt).toContain('path: src/app.ts');
    expect(commitUserPrompt).toContain('path: src/auth.ts');
    expect(commitUserPrompt).toContain('key_change:');
  });

  it('commits only the selected batch paths when the git service supports pathscoped commits', async () => {
    const runCommand = vi.fn(async (args: string[]) => {
      const key = args.join(' ');
      if (key === 'diff --numstat HEAD -- src/app.ts') return '5\t2\tsrc/app.ts';
      if (key === 'diff --no-color --unified=3 HEAD -- src/app.ts') {
        return ['diff --git a/src/app.ts b/src/app.ts', '@@ -1 +1 @@', '-old', '+new'].join('\n');
      }
      if (key === 'rev-parse --short HEAD') return 'abc1234';
      if (key === 'show -s --format=%s HEAD') return 'chore(src): adjust app behavior';
      throw new Error(`Unexpected command: ${key}`);
    });
    const stagePaths = vi.fn(async () => '');
    const commitWithMessageForPaths = vi.fn(async () => '');

    const service = new AiService({
      getRepoPath: () => '/tmp/repo',
      getStatusPorcelain: vi.fn()
        .mockResolvedValueOnce(' M src/app.ts\n')
        .mockResolvedValueOnce(''),
      runCommand,
      stagePaths,
      commitWithMessageForPaths,
    } as any);

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(okJsonResponse({ message: { content: '{"selectedPaths":["src/app.ts"]}' } }))
      .mockResolvedValueOnce(okJsonResponse({ message: { content: '{"title":"chore(src): adjust app behavior","description":""}' } }));
    vi.stubGlobal('fetch', fetchMock as any);

    await service.runAutoCommit(
      { ...baseSettings, aiProvider: 'ollama', ollamaModel: 'test-model' },
      () => '',
    );

    expect(stagePaths).toHaveBeenCalledWith(['src/app.ts']);
    expect(commitWithMessageForPaths).toHaveBeenCalledWith({
      title: expect.any(String),
      description: '',
    }, ['src/app.ts']);
    expect(runCommand.mock.calls.some((call) => Array.isArray(call[0]) && call[0][0] === 'commit')).toBe(false);
  });

  it('uses batch-level fallback message without first-file bias', () => {
    const message = buildFallbackCommitMessage([
      { path: 'docs/readme.md', changeType: 'modified', additions: 1, deletions: 0 },
      { path: 'src/core.ts', changeType: 'modified', additions: 30, deletions: 5 },
    ]);

    expect(message.title).toContain('chore(src):');
    expect(message.title).toContain('2 files');
  });

  it('keeps per-file diff command count low in normal mode', async () => {
    const runCommand = vi.fn(async (args: string[]) => {
      const key = args.join(' ');
      if (key === 'diff --numstat HEAD -- src/app.ts') return '3\t1\tsrc/app.ts';
      if (key === 'diff --no-color --unified=3 HEAD -- src/app.ts') {
        return ['diff --git a/src/app.ts b/src/app.ts', '@@ -1 +1 @@', '-legacy', '+modern'].join('\n');
      }
      if (args[0] === 'add') return '';
      if (args[0] === 'commit') return '';
      if (key === 'rev-parse --short HEAD') return '333cccc';
      if (key === 'show -s --format=%s HEAD') return 'chore(src): update 1 file';
      throw new Error(`Unexpected command: ${key}`);
    });

    const service = new AiService({
      getRepoPath: () => '/tmp/repo',
      getStatusPorcelain: vi.fn()
        .mockResolvedValueOnce(' M src/app.ts\n')
        .mockResolvedValueOnce(''),
      runCommand,
    } as any);

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(okJsonResponse({ message: { content: '{"selectedPaths":["src/app.ts"]}' } }))
      .mockResolvedValueOnce(okJsonResponse({ message: { content: '{"title":"chore(src): modernize app path","description":""}' } }));
    vi.stubGlobal('fetch', fetchMock as any);

    await service.runAutoCommit(
      { ...baseSettings, aiProvider: 'ollama', ollamaModel: 'test-model' },
      () => '',
    );

    const diffCommands = runCommand.mock.calls
      .map((call) => (Array.isArray(call[0]) ? call[0].join(' ') : ''))
      .filter((cmd) => cmd.startsWith('diff ') && cmd.includes('src/app.ts'));
    expect(diffCommands.length).toBeLessThanOrEqual(2);
    expect(diffCommands).toContain('diff --numstat HEAD -- src/app.ts');
    expect(diffCommands).toContain('diff --no-color --unified=3 HEAD -- src/app.ts');
  });

  it('aborts pending AI requests quickly when cancellation is requested', async () => {
    let cancelRequested = false;

    const runCommand = vi.fn(async (args: string[]) => {
      const key = args.join(' ');
      if (key === 'diff --numstat HEAD -- src/a.ts') return '1\t0\tsrc/a.ts';
      if (key === 'diff --numstat HEAD -- src/b.ts') return '1\t0\tsrc/b.ts';
      if (key === 'diff --no-color --unified=3 HEAD -- src/a.ts') return ['@@ -1 +1 @@', '-a', '+aa'].join('\n');
      if (key === 'diff --no-color --unified=3 HEAD -- src/b.ts') return ['@@ -1 +1 @@', '-b', '+bb'].join('\n');
      throw new Error(`Unexpected command: ${key}`);
    });

    const service = new AiService({
      getRepoPath: () => '/tmp/repo',
      getStatusPorcelain: vi.fn().mockResolvedValueOnce(' M src/a.ts\n M src/b.ts\n'),
      runCommand,
    } as any);

    let abortCount = 0;
    const fetchMock = vi.fn(async (_url: string, init: any) => (
      new Promise((_resolve, reject) => {
        const signal = init?.signal as AbortSignal | undefined;
        if (signal?.aborted) {
          const err: any = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
          return;
        }
        signal?.addEventListener('abort', () => {
          abortCount += 1;
          const err: any = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      })
    ));
    vi.stubGlobal('fetch', fetchMock as any);

    setTimeout(() => {
      cancelRequested = true;
    }, 10);

    await expect(
      service.runAutoCommit(
        { ...baseSettings, aiProvider: 'ollama', ollamaModel: 'test-model' },
        () => '',
        undefined,
        () => cancelRequested,
      ),
    ).rejects.toThrow('abgebrochen');

    expect(abortCount).toBeGreaterThan(0);
  });

  it('stops retry loops after repeated commit failures instead of hanging', async () => {
    const runCommand = vi.fn(async (args: string[]) => {
      const key = args.join(' ');
      if (key === 'diff --numstat HEAD -- src/app.ts') return '3\t1\tsrc/app.ts';
      if (key === 'diff --no-color --unified=3 HEAD -- src/app.ts') {
        return ['diff --git a/src/app.ts b/src/app.ts', '@@ -1 +1 @@', '-old', '+new'].join('\n');
      }
      if (args[0] === 'add') return '';
      if (args[0] === 'commit') throw new Error('pre-commit hook failed');
      throw new Error(`Unexpected command: ${key}`);
    });

    const service = new AiService({
      getRepoPath: () => '/tmp/repo',
      getStatusPorcelain: vi.fn()
        .mockResolvedValueOnce(' M src/app.ts\n')
        .mockResolvedValueOnce(' M src/app.ts\n'),
      runCommand,
    } as any);

    const fetchMock = vi.fn(async () => (
      okJsonResponse({ message: { content: '{"title":"chore(src): retry commit","description":""}' } })
    ));
    vi.stubGlobal('fetch', fetchMock as any);

    const result = await service.runAutoCommit(
      { ...baseSettings, aiProvider: 'ollama', ollamaModel: 'test-model' },
      () => '',
    );

    const commitAttempts = runCommand.mock.calls
      .map((call) => (Array.isArray(call[0]) ? call[0][0] : ''))
      .filter((command) => command === 'commit').length;

    expect(commitAttempts).toBeLessThanOrEqual(8);
    expect(result.commits).toHaveLength(0);
    expect(result.warnings.some((warning) => warning.includes('wiederholten Commit-Fehlern'))).toBe(true);
  });
});

describe('AiService large hybrid strategy', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function createRunCommandForFiles(files: string[]) {
    let commitCounter = 0;

    return vi.fn(async (args: string[]) => {
      const key = args.join(' ');
      if (key === 'diff --numstat HEAD --') {
        return files.map((file) => `1\t0\t${file}`).join('\n');
      }
      if (key.startsWith('diff --numstat HEAD -- ')) {
        const file = key.slice('diff --numstat HEAD -- '.length);
        return `1\t0\t${file}`;
      }
      if (key.startsWith('diff --no-color --unified=3 HEAD -- ')) {
        const file = key.slice('diff --no-color --unified=3 HEAD -- '.length);
        return ['@@ -1 +1 @@', '-old', `+new ${file}`].join('\n');
      }
      if (args[0] === 'add') return '';
      if (args[0] === 'commit') {
        commitCounter += 1;
        return '';
      }
      if (key === 'rev-parse --short HEAD') {
        return `abc${String(commitCounter).padStart(4, '0')}`;
      }
      if (key === 'show -s --format=%s HEAD') {
        return `chore(src): commit ${commitCounter}`;
      }
      throw new Error(`Unexpected command: ${key}`);
    });
  }

  function createStatusForFiles(files: string[]) {
    return `${files.map((file) => ` M ${file}`).join('\n')}\n`;
  }

  function createSingletonGroupPlan(files: string[]) {
    return JSON.stringify({
      groups: files.map((file) => ({ paths: [file] })),
    });
  }

  it('starts in large-hybrid when 8 or more files are changed', async () => {
    const files = Array.from({ length: 8 }, (_, index) => `src/file-${index + 1}.ts`);
    const runCommand = createRunCommandForFiles(files);
    const progressUpdates: Array<{ details?: Record<string, unknown> }> = [];

    const service = new AiService({
      getRepoPath: () => '/tmp/repo',
      getStatusPorcelain: vi.fn()
        .mockResolvedValueOnce(createStatusForFiles(files))
        .mockResolvedValueOnce(''),
      runCommand,
    } as any);

    let callCount = 0;
    const fetchMock = vi.fn(async () => {
      callCount += 1;
      if (callCount === 1) {
        return okJsonResponse({ message: { content: createSingletonGroupPlan(files) } });
      }
      return okJsonResponse({ message: { content: '{"title":"chore(src): update file set","description":""}' } });
    });
    vi.stubGlobal('fetch', fetchMock as any);

    await service.runAutoCommit(
      { ...baseSettings, aiProvider: 'ollama', ollamaModel: 'test-model' },
      () => '',
      (update) => progressUpdates.push(update),
    );

    const hybridUpdate = progressUpdates.find((update) => update.details?.strategy === 'large-hybrid');
    expect(hybridUpdate).toBeDefined();
    expect(runCommand).toHaveBeenCalledWith(['diff', '--numstat', 'HEAD', '--']);
  });

  it('switches back to standard strategy once 7 or fewer files remain', async () => {
    const files = Array.from({ length: 8 }, (_, index) => `src/file-${index + 1}.ts`);
    const runCommand = createRunCommandForFiles(files);
    const progressUpdates: Array<{ details?: Record<string, unknown> }> = [];

    const service = new AiService({
      getRepoPath: () => '/tmp/repo',
      getStatusPorcelain: vi.fn()
        .mockResolvedValueOnce(createStatusForFiles(files))
        .mockResolvedValueOnce(''),
      runCommand,
    } as any);

    let callCount = 0;
    const fetchMock = vi.fn(async () => {
      callCount += 1;
      if (callCount === 1) {
        return okJsonResponse({ message: { content: createSingletonGroupPlan(files) } });
      }
      return okJsonResponse({ message: { content: '{"title":"chore(src): update file set","description":""}' } });
    });
    vi.stubGlobal('fetch', fetchMock as any);

    await service.runAutoCommit(
      { ...baseSettings, aiProvider: 'ollama', ollamaModel: 'test-model' },
      () => '',
      (update) => progressUpdates.push(update),
    );

    const switchEvent = progressUpdates.find((update) => update.details?.step === 'strategy-switch');
    expect(switchEvent).toBeDefined();
    expect(switchEvent?.details?.strategy).toBe('standard');
  });

  it('falls back to deterministic grouping when hybrid plan is invalid', async () => {
    const files = Array.from({ length: 8 }, (_, index) => `src/file-${index + 1}.ts`);
    const runCommand = createRunCommandForFiles(files);
    const progressUpdates: Array<{ details?: Record<string, unknown> }> = [];

    const service = new AiService({
      getRepoPath: () => '/tmp/repo',
      getStatusPorcelain: vi.fn()
        .mockResolvedValueOnce(createStatusForFiles(files))
        .mockResolvedValueOnce(''),
      runCommand,
    } as any);

    let callCount = 0;
    const fetchMock = vi.fn(async () => {
      callCount += 1;
      if (callCount === 1) {
        return okJsonResponse({ message: { content: '{"groups":[{"paths":["src/file-1.ts"]}]}' } });
      }
      return okJsonResponse({ message: { content: '{"title":"chore(src): deterministic fallback","description":""}' } });
    });
    vi.stubGlobal('fetch', fetchMock as any);

    const result = await service.runAutoCommit(
      { ...baseSettings, aiProvider: 'ollama', ollamaModel: 'test-model' },
      () => '',
      (update) => progressUpdates.push(update),
    );

    expect(result.warnings.some((warning) => warning.includes('Hybrid-Gruppenplanung'))).toBe(true);
    const fallbackEvent = progressUpdates.find((update) => update.details?.step === 'deterministic-fallback');
    expect(fallbackEvent).toBeDefined();
  });

  it('stops additional AI calls after hybrid budget is exhausted', async () => {
    const files = Array.from({ length: 14 }, (_, index) => `src/file-${index + 1}.ts`);
    const runCommand = createRunCommandForFiles(files);
    const nowState = { value: 0 };
    vi.spyOn(Date, 'now').mockImplementation(() => nowState.value);

    const service = new AiService({
      getRepoPath: () => '/tmp/repo',
      getStatusPorcelain: vi.fn()
        .mockResolvedValueOnce(createStatusForFiles(files))
        .mockResolvedValueOnce(''),
      runCommand,
    } as any);

    let callCount = 0;
    const fetchMock = vi.fn(async () => {
      callCount += 1;
      if (callCount === 1) {
        nowState.value += 55_000;
        return okJsonResponse({ message: { content: createSingletonGroupPlan(files) } });
      }
      if (callCount === 2) {
        nowState.value += 8_000;
        return okJsonResponse({ message: { content: '{"title":"chore(src): first ai message","description":""}' } });
      }
      return okJsonResponse({ message: { content: '{"title":"chore(src): should not be called","description":""}' } });
    });
    vi.stubGlobal('fetch', fetchMock as any);

    const result = await service.runAutoCommit(
      { ...baseSettings, aiProvider: 'ollama', ollamaModel: 'test-model' },
      () => '',
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.warnings.some((warning) => warning.includes('KI-Budget erreicht'))).toBe(true);
  });

  it('cancels quickly while hybrid group planning request is in-flight', async () => {
    const files = Array.from({ length: 8 }, (_, index) => `src/file-${index + 1}.ts`);
    const runCommand = createRunCommandForFiles(files);
    let cancelRequested = false;
    let abortCount = 0;

    const service = new AiService({
      getRepoPath: () => '/tmp/repo',
      getStatusPorcelain: vi.fn().mockResolvedValueOnce(createStatusForFiles(files)),
      runCommand,
    } as any);

    const fetchMock = vi.fn(async (_url: string, init: any) => (
      new Promise((_resolve, reject) => {
        const signal = init?.signal as AbortSignal | undefined;
        if (signal?.aborted) {
          const err: any = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
          return;
        }
        signal?.addEventListener('abort', () => {
          abortCount += 1;
          const err: any = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      })
    ));
    vi.stubGlobal('fetch', fetchMock as any);

    setTimeout(() => {
      cancelRequested = true;
    }, 10);

    await expect(
      service.runAutoCommit(
        { ...baseSettings, aiProvider: 'ollama', ollamaModel: 'test-model' },
        () => '',
        undefined,
        () => cancelRequested,
      ),
    ).rejects.toThrow('abgebrochen');

    expect(abortCount).toBeGreaterThan(0);
  });
});

