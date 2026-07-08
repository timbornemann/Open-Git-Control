import type { AppSettings } from '../settings';
import type { AiProviderClient } from './AiProviderClient';
import { getExtension, getTopDirectory } from './gitStatusSnapshot';
import type { SnapshotFile } from './aiServiceTypes';
import { hasStringArrayPaths, parseJsonFromText, uniqueSorted } from './jsonResponse';
import { CHAT_TIMEOUT_MS, runProviderText } from './providerText';

const MAX_COMMIT_FILES_NORMAL = 5;

export async function chooseFilesWithAi(
  providerClient: AiProviderClient,
  settings: AppSettings,
  candidateWindow: SnapshotFile[],
  getGeminiApiKey: () => string,
  shouldCancel?: () => boolean,
  timeoutMs = CHAT_TIMEOUT_MS,
): Promise<string[]> {
  if (candidateWindow.length <= 1) {
    return candidateWindow.map((file) => file.path);
  }

  const systemPrompt = [
    'You decide which files should be committed together in one small coherent commit.',
    'Return strict JSON only: {"selectedPaths": string[]} with at least 1 and at most 5 items.',
    'Only choose paths from the provided list.',
    'Prefer fine-grained commits.',
    'Use all candidate signals (path, type, stats, key changes), not only the first candidate.',
    'When in doubt, choose the safest coherent subset.',
  ].join(' ');

  const userPrompt = [
    'Candidates:',
    ...candidateWindow.flatMap((file, index) => {
      const keyChanges = file.keyChanges.length > 0 ? file.keyChanges : [file.preview];
      return [
        `${index + 1}. path: ${file.path}`,
        `   type: ${file.changeType}, stats: +${file.additions}/-${file.deletions}, binary: ${file.isBinary ? 'yes' : 'no'}`,
        ...keyChanges.slice(0, 6).map((line) => `   key_change: ${line}`),
      ];
    }),
    'Return JSON only.',
  ].join('\n');

  const raw = await runProviderText(providerClient, settings, systemPrompt, userPrompt, getGeminiApiKey, shouldCancel, timeoutMs);
  const parsed = parseJsonFromText(raw) || {};
  const selectedRaw = Array.isArray(parsed.selectedPaths) ? parsed.selectedPaths : [];
  const candidateSet = new Set(candidateWindow.map((file) => file.path));

  const selected = selectedRaw
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim())
    .filter((item) => candidateSet.has(item));

  const unique = uniqueSorted(selected);
  return unique.length > 0 ? unique.slice(0, MAX_COMMIT_FILES_NORMAL) : [candidateWindow[0].path];
}

export async function planGroupsWithAi(
  providerClient: AiProviderClient,
  settings: AppSettings,
  files: SnapshotFile[],
  getGeminiApiKey: () => string,
  shouldCancel?: () => boolean,
  timeoutMs = CHAT_TIMEOUT_MS,
): Promise<string[][]> {
  if (files.length <= 1) {
    return [files.map((file) => file.path)];
  }

  const candidatePaths = files.map((file) => file.path);
  const candidateSet = new Set(candidatePaths);

  const systemPrompt = [
    'You group changed files into coherent commit batches.',
    'Return strict JSON only.',
    'Format: {"groups":[{"paths":[string]}]}.',
    'Each file path must appear exactly once across all groups.',
    'Only use the provided paths.',
    'Prefer small coherent groups over large mixed groups.',
  ].join(' ');

  const userPrompt = [
    'Changed files:',
    ...files.map(
      (file, index) =>
        `${index + 1}. path=${file.path}; type=${file.changeType}; stats=+${file.additions}/-${file.deletions}; area=${getTopDirectory(file.path)}; ext=${getExtension(file.path)}`,
    ),
    'Return JSON only.',
  ].join('\n');

  const raw = await runProviderText(providerClient, settings, systemPrompt, userPrompt, getGeminiApiKey, shouldCancel, timeoutMs);
  const parsed = parseJsonFromText(raw) || {};
  const parsedGroupsRaw: unknown[] = Array.isArray(parsed.groups) ? parsed.groups : [];

  const normalizedGroups: string[][] = parsedGroupsRaw
    .map((group): unknown[] => {
      if (Array.isArray(group)) {
        return group;
      }
      if (hasStringArrayPaths(group)) {
        return group.paths;
      }
      return [];
    })
    .map((group) =>
      group
        .filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item: string) => item.trim())
        .filter((item: string) => candidateSet.has(item)),
    )
    .map((group) => uniqueSorted(group))
    .filter((group) => group.length > 0);

  if (normalizedGroups.length === 0) {
    return [];
  }

  const flattened = normalizedGroups.flat();
  const unique = new Set(flattened);
  if (unique.size !== flattened.length) {
    return [];
  }
  if (unique.size !== candidateSet.size) {
    return [];
  }

  return normalizedGroups;
}
