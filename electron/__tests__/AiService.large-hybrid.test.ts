import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiService } from '../AiService';
import { baseSettings, okJsonResponse } from './helpers/aiServiceTestUtils';

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
      getStatusPorcelain: vi.fn().mockResolvedValueOnce(createStatusForFiles(files)).mockResolvedValueOnce(''),
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
      getStatusPorcelain: vi.fn().mockResolvedValueOnce(createStatusForFiles(files)).mockResolvedValueOnce(''),
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
      getStatusPorcelain: vi.fn().mockResolvedValueOnce(createStatusForFiles(files)).mockResolvedValueOnce(''),
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
      getStatusPorcelain: vi.fn().mockResolvedValueOnce(createStatusForFiles(files)).mockResolvedValueOnce(''),
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

    const result = await service.runAutoCommit({ ...baseSettings, aiProvider: 'ollama', ollamaModel: 'test-model' }, () => '');

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

    const fetchMock = vi.fn(
      async (_url: string, init: any) =>
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
        }),
    );
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
