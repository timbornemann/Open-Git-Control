import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiService } from '../AiService';
import { baseSettings, createFakeGitService, okJsonResponse } from './helpers/aiServiceTestUtils';

const fakeGitService = createFakeGitService();

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
    await expect(
      service.listModels(baseSettings, () => {
        throw new Error('secret backend unavailable');
      }),
    ).rejects.toThrow('secret backend unavailable');
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
    const fetchMock = vi.fn(async (_url: string, _init: any) =>
      okJsonResponse({
        candidates: [
          {
            content: {
              parts: [{ text: '# Release v2.0.0\n\nThis major release adds the new workflow.' }],
            },
          },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock as any);

    const service = new AiService(fakeGitService);
    const markdown = await service.generateReleaseNotes(baseSettings, () => 'secure-key-123', {
      tagName: 'v2.0.0',
      releaseName: 'Release v2.0.0',
      lastReleaseTag: 'v1.4.2',
      commits: [
        {
          hash: 'abc123',
          shortHash: 'abc123',
          subject: 'feat: add new workflow',
          author: 'Tim',
          date: '2026-06-14',
          htmlUrl: 'https://github.com/acme/project/commit/abc123',
        },
      ],
      repositoryHtmlUrl: 'https://github.com/acme/project',
      language: 'en',
      versionBump: 'major',
    });

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    const systemPrompt = requestBody.systemInstruction.parts[0].text;
    const userPrompt = requestBody.contents[0].parts[0].text;

    expect(systemPrompt).toContain('semantic version classification');
    expect(systemPrompt).toContain('Do not invent URLs');
    expect(userPrompt).toContain('Semantic version change: major');
    expect(userPrompt).toContain('Explicitly call this a major release');
    expect(userPrompt).toContain('breaking changes and migration requirements');
    expect(userPrompt).toContain('Repository URL: https://github.com/acme/project');
    expect(userPrompt).toContain('url=https://github.com/acme/project/commit/abc123');
    expect(userPrompt).toContain('Never write example.com');
    expect(markdown).toContain('This major release');
  });

  it('links only explicit commit urls in the deterministic fallback', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('provider unavailable');
    });
    vi.stubGlobal('fetch', fetchMock as any);

    const service = new AiService(fakeGitService);
    const markdown = await service.generateReleaseNotes(baseSettings, () => 'secure-key-123', {
      tagName: 'v1.3.1',
      releaseName: 'Release v1.3.1',
      lastReleaseTag: 'v1.3.0',
      commits: [
        {
          hash: 'abc123',
          shortHash: 'abc123',
          subject: 'fix: keep release links real',
          author: 'Tim',
          date: '2026-06-14',
          htmlUrl: 'https://github.com/acme/project/commit/abc123',
        },
        {
          hash: 'def456',
          shortHash: 'def456',
          subject: 'docs: update changelog',
          author: 'Tim',
          date: '2026-06-15',
        },
      ],
      repositoryHtmlUrl: 'https://github.com/acme/project',
      language: 'en',
      versionBump: 'patch',
    });

    expect(markdown).toContain('- fix: keep release links real ([abc123](https://github.com/acme/project/commit/abc123))');
    expect(markdown).toContain('- docs: update changelog (def456)');
    expect(markdown).not.toContain('example.com');
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
