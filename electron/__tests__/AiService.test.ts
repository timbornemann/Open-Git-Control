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
  secretScanBeforePushEnabled: true,
  secretScanStrictness: 'medium',
  secretScanAllowlist: '',
  aiAutoCommitEnabled: true,
  aiProvider: 'gemini',
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
});

