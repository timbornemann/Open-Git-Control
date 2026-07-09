import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiService } from '../AiService';
import { baseSettings, createFakeGitService, okJsonResponse } from './helpers/aiServiceTestUtils';

const fakeGitService = createFakeGitService();

describe('AiService commit message from user notes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('generates a commit message from notes without adding file context', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: any) =>
      okJsonResponse({
        message: {
          content: JSON.stringify({
            title: 'feat(settings): add commit message styles',
            description: 'Adds selectable styles for AI-generated commit messages.',
          }),
        },
      }),
    );
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
    const fetchMock = vi.fn(async (_url: string, _init: any) =>
      okJsonResponse({
        message: { content: '{"title":"update commit message generator","description":""}' },
      }),
    );
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
    const fetchMock = vi.fn(async (_url: string, _init: any) =>
      okJsonResponse({
        message: { content: '{"title":"fix(settings): preserve commit language","description":""}' },
      }),
    );
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
