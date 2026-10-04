import { afterEach, expect, it, vi } from 'vitest';
import { aiClient } from '@/services/aiClient';

afterEach(() => vi.unstubAllGlobals());

it('generates release notes through the neutral AI domain without a hosting account', async () => {
  const result = { success: true, data: { body: 'Notes' } };
  const aiGenerateReleaseNotes = vi.fn().mockResolvedValue(result);
  vi.stubGlobal('window', { electronAPI: { ai: { aiGenerateReleaseNotes } } });
  const notes = { tagName: 'v1', releaseName: 'v1', commits: [], language: 'de' as const, versionBump: 'patch' as const };

  await expect(aiClient.generateReleaseNotes(notes)).resolves.toBe(result);
  expect(aiGenerateReleaseNotes).toHaveBeenCalledWith(notes);
});
