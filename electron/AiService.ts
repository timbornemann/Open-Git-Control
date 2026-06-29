import { GitService, gitService } from './GitService';
import { AiCommitMessageStyle, AppSettings, AiProvider } from './settings';
import * as fs from 'fs';
import * as path from 'path';

type StatusEntry = {
  path: string;
  x: string;
  y: string;
  code: string;
};

type FileChangeType = 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked' | 'other';

type SnapshotFile = {
  path: string;
  changeType: FileChangeType;
  additions: number;
  deletions: number;
  isBinary: boolean;
  preview: string;
  keyChanges: string[];
  groupKey: string;
  hydrated: boolean;
};

export type CommitMessage = {
  title: string;
  description: string;
};

type AiCommit = {
  hash: string;
  subject: string;
};

type ProgressPhase = 'snapshot' | 'grouping' | 'committing' | 'retry' | 'fallback' | 'done' | 'failed';
type ProgressMode = 'normal' | 'retry' | 'fallback';
type AutoCommitStrategy = 'standard' | 'large-hybrid';

export type AiProgressUpdate = {
  phase: ProgressPhase;
  message: string;
  progress?: number;
  details?: Record<string, unknown>;
};

export type AiAutoCommitResult = {
  commits: AiCommit[];
  summary: string;
  turns: number;
  modeTransitions: string[];
  processedFiles: number;
  remainingFiles: number;
  commitPlanStats: {
    groupCount: number;
    retries: number;
    fallbackCommits: number;
    totalCommits: number;
    totalFilesProcessed: number;
  };
  warnings: string[];
  diagnostics: string[];
};

export type ReleaseCommitInput = {
  hash: string;
  shortHash: string;
  subject: string;
  author: string;
  date: string;
};

export type ReleaseVersionBump = 'major' | 'minor' | 'patch';

const CHAT_TIMEOUT_MS = 90_000;
const RUN_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_USER_COMMIT_NOTES_CHARS = 8_000;
const MAX_COMMIT_DESCRIPTION_CHARS = 2_000;
const MAX_PREVIEW_CHARS = 220;
const MAX_CONTEXT_LINE_CHARS = 140;
const MAX_CONTEXT_ITEMS_PER_HUNK = 3;
const MAX_CONTEXT_HUNKS = 3;
const MAX_CONTEXT_ITEMS_TOTAL = 12;
const MAX_UNTRACKED_SNIPPET_LINES = 12;
const MAX_COMMIT_FILES_NORMAL = 5;
const MAX_COMMIT_FILES_RETRY = 3;
const MAX_COMMIT_FILES_FALLBACK = 2;
const MAX_NET_LINES_PER_COMMIT = 450;
const MAX_RETRIES_PER_GROUP = 2;
const MAX_GROUP_STALL_CYCLES = 8;
const LARGE_BATCH_THRESHOLD = 8;
const STANDARD_BATCH_THRESHOLD = 7;
const LARGE_HYBRID_AI_BUDGET_MS = 60_000;
const LARGE_HYBRID_PLAN_TIMEOUT_MS = 12_000;
const LARGE_HYBRID_SELECT_TIMEOUT_MS = 10_000;
const LARGE_HYBRID_MESSAGE_TIMEOUT_MS = 14_000;
const MIN_AI_CALL_BUDGET_MS = 1_200;
const CONFLICT_CODES = new Set(['UU', 'AA', 'DD', 'AU', 'UA', 'DU', 'UD']);

function safeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function decodePorcelainPath(rawPath: string): string {
  const trimmed = rawPath.trim();
  if (trimmed.length < 2 || !trimmed.startsWith('"') || !trimmed.endsWith('"')) {
    return trimmed;
  }

  const body = trimmed.slice(1, -1);
  const bytes: number[] = [];
  const escapeToByte: Record<string, number> = {
    a: 0x07,
    b: 0x08,
    f: 0x0c,
    n: 0x0a,
    r: 0x0d,
    t: 0x09,
    v: 0x0b,
    '\\': 0x5c,
    '"': 0x22,
  };

  for (let i = 0; i < body.length; i += 1) {
    const char = body[i];
    if (char !== '\\') {
      bytes.push(...Buffer.from(char, 'utf8'));
      continue;
    }

    const escaped = body[i + 1];
    if (!escaped) {
      bytes.push(0x5c);
      break;
    }

    i += 1;
    if (/[0-7]/.test(escaped)) {
      let octal = escaped;
      while (octal.length < 3 && i + 1 < body.length && /[0-7]/.test(body[i + 1])) {
        i += 1;
        octal += body[i];
      }
      bytes.push(parseInt(octal, 8));
      continue;
    }

    const mapped = escapeToByte[escaped];
    if (mapped !== undefined) {
      bytes.push(mapped);
      continue;
    }

    bytes.push(...Buffer.from(escaped, 'utf8'));
  }

  return Buffer.from(bytes).toString('utf8');
}

export function parseStatusPorcelain(statusOutput: string): StatusEntry[] {
  if (!statusOutput.trim()) return [];

  return statusOutput
    .split('\n')
    .map(line => line.trimEnd())
    .filter(line => line.length >= 3)
    .map(line => {
      const x = line[0];
      const y = line[1];
      const rawPath = line.slice(3).trim();
      const renameSeparatorIndex = rawPath.lastIndexOf(' -> ');
      const targetPath = renameSeparatorIndex >= 0 ? rawPath.slice(renameSeparatorIndex + 4) : rawPath;
      const path = decodePorcelainPath(targetPath);
      return { path, x, y, code: `${x}${y}` };
    })
    .filter(entry => entry.path.length > 0);
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function normalizeGeminiModel(model: string): string {
  const trimmed = model.trim();
  if (!trimmed) return '';
  return trimmed.startsWith('models/') ? trimmed.slice('models/'.length) : trimmed;
}

function getSelectedModel(settings: AppSettings): string {
  return settings.aiProvider === 'gemini'
    ? normalizeGeminiModel(settings.geminiModel)
    : settings.ollamaModel.trim();
}

function detectChangeType(entry: StatusEntry): FileChangeType {
  if (entry.code === '??' || entry.x === '?' || entry.y === '?') return 'untracked';
  const code = `${entry.x}${entry.y}`;
  if (code.includes('R')) return 'renamed';
  if (code.includes('A')) return 'added';
  if (code.includes('D')) return 'deleted';
  if (code.includes('M')) return 'modified';
  return 'other';
}

function getExtension(pathValue: string): string {
  const idx = pathValue.lastIndexOf('.');
  if (idx < 0 || idx === pathValue.length - 1) return 'none';
  return pathValue.slice(idx + 1).toLowerCase();
}

function getTopDirectory(pathValue: string): string {
  const normalized = pathValue.replace(/\\/g, '/');
  const first = normalized.split('/')[0];
  return first || 'root';
}

function buildGroupKey(pathValue: string, changeType: FileChangeType): string {
  const normalized = pathValue.replace(/\\/g, '/').toLowerCase();
  const ext = getExtension(normalized);
  const topDir = getTopDirectory(normalized);

  if (/package-lock\.json$|yarn\.lock$|pnpm-lock\.ya?ml$|bun\.lockb$/.test(normalized)) {
    return 'special:lockfiles';
  }

  if (/(^|\/)(migrations?|db\/migrate|prisma\/migrations)(\/|$)/.test(normalized)) {
    return 'special:migrations';
  }

  if (/(^|\/)(dist|build|coverage|out|target|generated|.next)(\/|$)/.test(normalized) || /\.min\./.test(normalized)) {
    return 'special:generated';
  }

  if (['md', 'mdx', 'txt', 'rst', 'adoc'].includes(ext)) {
    return 'special:docs';
  }

  return `${topDir}:${ext}:${changeType}`;
}

function parseNumstatLine(raw: string): { additions: number; deletions: number; isBinary: boolean } {
  const trimmed = (raw || '').trim();
  const match = trimmed.match(/^(\d+|-)\s+(\d+|-)\s+(.+)$/);
  if (!match) {
    return { additions: 0, deletions: 0, isBinary: false };
  }

  const isBinary = match[1] === '-' || match[2] === '-';
  return {
    additions: match[1] === '-' ? 0 : Number(match[1]),
    deletions: match[2] === '-' ? 0 : Number(match[2]),
    isBinary,
  };
}

function clipContextLine(line: string, maxChars = MAX_CONTEXT_LINE_CHARS): string {
  const compact = String(line || '').replace(/\s+/g, ' ').trim();
  if (!compact) return '';
  return compact.length <= maxChars ? compact : `${compact.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

function parseNumstatReport(numstatOutput: string): Map<string, { additions: number; deletions: number; isBinary: boolean }> {
  const byPath = new Map<string, { additions: number; deletions: number; isBinary: boolean }>();
  const lines = (numstatOutput || '').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parsed = parseNumstatLine(trimmed);
    const match = trimmed.match(/^(\d+|-)\s+(\d+|-)\s+(.+)$/);
    if (!match) continue;
    const rawPath = match[3].trim();
    const renameSeparatorIndex = rawPath.lastIndexOf(' -> ');
    const targetPath = renameSeparatorIndex >= 0 ? rawPath.slice(renameSeparatorIndex + 4) : rawPath;
    const decodedPath = decodePorcelainPath(targetPath);
    if (!decodedPath) continue;
    byPath.set(decodedPath, parsed);
  }
  return byPath;
}

function pickRepresentativeIndices(length: number): number[] {
  if (length <= 0) return [];
  if (length === 1) return [0];
  if (length === 2) return [0, 1];
  const middle = Math.floor((length - 1) / 2);
  return [...new Set([0, middle, length - 1])];
}

function pickRepresentativeItems<T>(values: T[], limit = 3): T[] {
  if (values.length <= limit) return [...values];
  return pickRepresentativeIndices(values.length)
    .slice(0, limit)
    .map((index) => values[index]);
}

function isDiffMetadataLine(line: string): boolean {
  return (
    /^diff --git /i.test(line)
    || /^index /i.test(line)
    || /^--- /i.test(line)
    || /^\+\+\+ /i.test(line)
    || /^new file mode /i.test(line)
    || /^deleted file mode /i.test(line)
    || /^similarity index /i.test(line)
    || /^rename from /i.test(line)
    || /^rename to /i.test(line)
    || /^old mode /i.test(line)
    || /^new mode /i.test(line)
    || /^Binary files /i.test(line)
    || /^GIT binary patch$/i.test(line)
  );
}

function deriveStatsFromDiff(diffText: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  const lines = (diffText || '').split(/\r?\n/);
  for (const line of lines) {
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+')) additions += 1;
    if (line.startsWith('-')) deletions += 1;
  }
  return { additions, deletions };
}

export function buildStructuredDiffContext(diffText: string): string[] {
  const lines = (diffText || '').split(/\r?\n/);
  type Hunk = { header: string; changes: string[] };

  const hunks: Hunk[] = [];
  const metadataFallback: string[] = [];
  let currentHunk: Hunk | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line) continue;

    if (line.startsWith('@@')) {
      currentHunk = {
        header: clipContextLine(line),
        changes: [],
      };
      hunks.push(currentHunk);
      continue;
    }

    if (isDiffMetadataLine(line)) {
      const metadata = clipContextLine(line);
      if (metadata) metadataFallback.push(metadata);
      continue;
    }

    if ((line.startsWith('+') || line.startsWith('-')) && !line.startsWith('+++') && !line.startsWith('---')) {
      const normalized = clipContextLine(line);
      if (!normalized) continue;
      if (!currentHunk) {
        currentHunk = { header: clipContextLine('@@ synthetic @@'), changes: [] };
        hunks.push(currentHunk);
      }
      currentHunk.changes.push(normalized);
      continue;
    }
  }

  const result: string[] = [];
  const chosenHunks = pickRepresentativeItems(hunks, MAX_CONTEXT_HUNKS);
  for (const hunk of chosenHunks) {
    if (hunk.header && hunk.header !== '@@ synthetic @@') {
      result.push(`hunk ${hunk.header}`);
    }
    const chosenChanges = pickRepresentativeItems(hunk.changes, MAX_CONTEXT_ITEMS_PER_HUNK);
    result.push(...chosenChanges);
  }

  if (result.length === 0) {
    return pickRepresentativeItems(
      metadataFallback.filter((line) => !/^index /i.test(line)),
      MAX_CONTEXT_ITEMS_PER_HUNK,
    );
  }

  return result.slice(0, MAX_CONTEXT_ITEMS_TOTAL);
}

export function buildFileSnippetContext(content: string): string[] {
  const sourceLines = (content || '')
    .split(/\r?\n/)
    .map((line) => clipContextLine(line))
    .filter(Boolean);
  if (sourceLines.length === 0) return [];

  const bounded = sourceLines.slice(0, MAX_UNTRACKED_SNIPPET_LINES);
  return pickRepresentativeItems(bounded, MAX_CONTEXT_ITEMS_PER_HUNK).map((line) => `+ ${line}`);
}

async function readUntrackedSnippet(repoPath: string, relativePath: string): Promise<string[]> {
  const absolutePath = path.resolve(repoPath, relativePath);
  const relative = path.relative(repoPath, absolutePath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    return [];
  }

  try {
    const stat = await fs.promises.stat(absolutePath);
    if (!stat.isFile()) return [];
    const raw = await fs.promises.readFile(absolutePath, 'utf8');
    return buildFileSnippetContext(raw);
  } catch {
    return [];
  }
}

function toContextPreview(keyChanges: string[]): string {
  if (keyChanges.length === 0) return '(no preview available)';
  return keyChanges.join(' | ').slice(0, MAX_PREVIEW_CHARS);
}

function clipCommitTitle(title: string): string {
  const normalized = title.replace(/\s+/g, ' ').trim();
  if (!normalized) return 'chore: update files';
  if (normalized.length <= 72) return normalized;
  return normalized.slice(0, 72).trimEnd();
}

function parseJsonFromText(rawText: string): Record<string, unknown> | null {
  const text = (rawText || '').trim();
  if (!text) return null;

  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fall through
  }

  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try {
      const parsed = JSON.parse(text.slice(first, last + 1));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // ignore
    }
  }

  return null;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  shouldCancel?: () => boolean,
): Promise<Response> {
  const controller = new AbortController();
  let abortedByTimeout = false;
  let abortedByCancel = false;
  const timeout = setTimeout(() => {
    abortedByTimeout = true;
    controller.abort();
  }, timeoutMs);
  const cancelPoll = setInterval(() => {
    if (!shouldCancel?.()) return;
    abortedByCancel = true;
    controller.abort();
  }, 120);

  try {
    if (shouldCancel?.()) {
      abortedByCancel = true;
      controller.abort();
    }
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error: unknown) {
    if ((error as any)?.name === 'AbortError') {
      if (abortedByCancel || shouldCancel?.()) {
        throw new Error('KI Auto-Commit wurde abgebrochen.');
      }
      if (abortedByTimeout) {
        throw new Error(`KI Anfrage Zeitlimit ueberschritten (${Math.round(timeoutMs / 1000)}s).`);
      }
      throw new Error(`KI Anfrage Zeitlimit ueberschritten (${Math.round(timeoutMs / 1000)}s).`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    clearInterval(cancelPoll);
  }
}

async function runProviderText(
  settings: AppSettings,
  systemPrompt: string,
  userPrompt: string,
  getGeminiApiKey: () => string,
  shouldCancel?: () => boolean,
  timeoutMs = CHAT_TIMEOUT_MS,
): Promise<string> {
  if (settings.aiProvider === 'gemini') {
    const apiKey = getGeminiApiKey().trim();
    if (!apiKey) {
      throw new Error('Gemini API key fehlt.');
    }

    const model = normalizeGeminiModel(settings.geminiModel);
    if (!model) {
      throw new Error('Gemini Modell fehlt.');
    }

    const response = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: { temperature: 0.1 },
        }),
      },
      timeoutMs,
      shouldCancel,
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Gemini Anfrage fehlgeschlagen (${response.status}): ${text || response.statusText}`);
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }>;
    };

    const parts = data.candidates?.[0]?.content?.parts || [];
    const content = parts
      .map((part) => safeString((part as any).text))
      .join('')
      .trim();

    return content;
  }

  const response = await fetchWithTimeout(
    `${settings.ollamaBaseUrl}/api/chat`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: settings.ollamaModel,
        stream: false,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        options: { temperature: 0.1 },
      }),
    },
    timeoutMs,
    shouldCancel,
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ollama Anfrage fehlgeschlagen (${response.status}): ${text || response.statusText}`);
  }

  const data = (await response.json()) as { message?: { content?: unknown } };
  return safeString(data.message?.content).trim();
}

function groupFilesDeterministically(files: SnapshotFile[]): SnapshotFile[][] {
  const groups = new Map<string, SnapshotFile[]>();

  for (const file of files) {
    const arr = groups.get(file.groupKey) || [];
    arr.push(file);
    groups.set(file.groupKey, arr);
  }

  return [...groups.values()]
    .map(group => group.sort((a, b) => a.path.localeCompare(b.path)))
    .sort((a, b) => {
      const aSpecial = a[0]?.groupKey.startsWith('special:') ? 0 : 1;
      const bSpecial = b[0]?.groupKey.startsWith('special:') ? 0 : 1;
      if (aSpecial !== bSpecial) return aSpecial - bSpecial;
      return a[0].groupKey.localeCompare(b[0].groupKey);
    });
}

function pickWindow(group: SnapshotFile[], mode: ProgressMode): SnapshotFile[] {
  const maxFiles = mode === 'fallback'
    ? MAX_COMMIT_FILES_FALLBACK
    : mode === 'retry'
      ? MAX_COMMIT_FILES_RETRY
      : MAX_COMMIT_FILES_NORMAL;

  const selected: SnapshotFile[] = [];
  let netLines = 0;

  for (const file of group) {
    if (selected.length >= maxFiles) break;
    const weight = file.additions + file.deletions;
    if (selected.length > 0 && netLines + weight > MAX_NET_LINES_PER_COMMIT) {
      break;
    }
    selected.push(file);
    netLines += weight;
  }

  if (selected.length === 0 && group.length > 0) {
    return [group[0]];
  }

  return selected;
}

async function chooseFilesWithAi(
  settings: AppSettings,
  candidateWindow: SnapshotFile[],
  getGeminiApiKey: () => string,
  shouldCancel?: () => boolean,
  timeoutMs = CHAT_TIMEOUT_MS,
): Promise<string[]> {
  if (candidateWindow.length <= 1) {
    return candidateWindow.map(file => file.path);
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

  const raw = await runProviderText(settings, systemPrompt, userPrompt, getGeminiApiKey, shouldCancel, timeoutMs);
  const parsed = parseJsonFromText(raw) || {};
  const selectedRaw = Array.isArray(parsed.selectedPaths) ? parsed.selectedPaths : [];
  const candidateSet = new Set(candidateWindow.map(file => file.path));

  const selected = selectedRaw
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map(item => item.trim())
    .filter(item => candidateSet.has(item));

  const unique = uniqueSorted(selected);
  return unique.length > 0 ? unique.slice(0, MAX_COMMIT_FILES_NORMAL) : [candidateWindow[0].path];
}

async function planGroupsWithAi(
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
    ...files.map((file, index) => (
      `${index + 1}. path=${file.path}; type=${file.changeType}; stats=+${file.additions}/-${file.deletions}; area=${getTopDirectory(file.path)}; ext=${getExtension(file.path)}`
    )),
    'Return JSON only.',
  ].join('\n');

  const raw = await runProviderText(settings, systemPrompt, userPrompt, getGeminiApiKey, shouldCancel, timeoutMs);
  const parsed = parseJsonFromText(raw) || {};
  const parsedGroupsRaw: unknown[] = Array.isArray(parsed.groups) ? parsed.groups : [];

  const normalizedGroups: string[][] = parsedGroupsRaw
    .map((group): unknown[] => {
      if (Array.isArray(group)) {
        return group;
      }
      if (group && typeof group === 'object' && Array.isArray((group as any).paths)) {
        return (group as any).paths;
      }
      return [];
    })
    .map((group) => (
      group
        .filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item: string) => item.trim())
        .filter((item: string) => candidateSet.has(item))
    ))
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

export function buildFallbackCommitMessage(
  batch: Array<{ path: string; changeType: FileChangeType; additions: number; deletions: number }>,
): CommitMessage {
  if (!Array.isArray(batch) || batch.length === 0) {
    return { title: 'chore: update files', description: '' };
  }

  const weightedScopeCounts = new Map<string, number>();
  const typeCounts = new Map<FileChangeType, number>();
  for (const file of batch) {
    const scope = getTopDirectory(file.path);
    const weight = Math.max(1, file.additions + file.deletions);
    weightedScopeCounts.set(scope, (weightedScopeCounts.get(scope) || 0) + weight);
    typeCounts.set(file.changeType, (typeCounts.get(file.changeType) || 0) + 1);
  }

  const sortedScopes = [...weightedScopeCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([scope]) => scope);
  const primaryScope = sortedScopes[0] || 'repo';

  const dominantType = [...typeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([type]) => type)[0] || 'other';
  const hasMixedTypes = typeCounts.size > 1;

  const action = hasMixedTypes
    ? 'update'
    : dominantType === 'deleted'
      ? 'remove'
      : dominantType === 'renamed'
        ? 'rename'
        : dominantType === 'added' || dominantType === 'untracked'
          ? 'add'
          : 'update';

  const title = clipCommitTitle(`chore(${primaryScope}): ${action} ${batch.length} file${batch.length === 1 ? '' : 's'}`);

  const needsDescription = hasMixedTypes || sortedScopes.length > 1;
  const description = needsDescription
    ? `Covers ${sortedScopes.slice(0, 3).join(', ')}.`
    : '';

  return { title, description };
}

async function generateCommitMessageWithAi(
  settings: AppSettings,
  batch: SnapshotFile[],
  getGeminiApiKey: () => string,
  shouldCancel?: () => boolean,
  timeoutMs = CHAT_TIMEOUT_MS,
): Promise<CommitMessage> {
  const systemPrompt = [
    'You write concise and factual git commit messages.',
    'Return strict JSON only: {"title": string, "description": string}.',
    'Title must be imperative, <=72 chars, no trailing period.',
    'Title must cover the full batch, not just one file.',
    'Only use single-file specific wording when the batch has exactly one file.',
    'If uncertain, use a safer and broader summary instead of inventing details.',
    'Description should be short and only included when it adds essential context.',
  ].join(' ');

  const userPrompt = [
    'Files in this commit:',
    ...batch.flatMap((file) => {
      const keyChanges = file.keyChanges.length > 0 ? file.keyChanges : [file.preview];
      return [
        `- path: ${file.path}`,
        `  type: ${file.changeType}, stats: +${file.additions}/-${file.deletions}, binary: ${file.isBinary ? 'yes' : 'no'}`,
        ...keyChanges.slice(0, 6).map((line) => `  key_change: ${line}`),
      ];
    }),
    'Return JSON only.',
  ].join('\n');

  try {
    const raw = await runProviderText(settings, systemPrompt, userPrompt, getGeminiApiKey, shouldCancel, timeoutMs);
    const parsed = parseJsonFromText(raw) || {};
    const titleRaw = safeString(parsed.title, '').trim();
    const title = clipCommitTitle(titleRaw);
    if (!titleRaw) {
      return buildFallbackCommitMessage(batch);
    }
    const description = safeString(parsed.description, '').trim();
    return { title, description };
  } catch {
    return buildFallbackCommitMessage(batch);
  }
}

function normalizeUserCommitNotes(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, MAX_USER_COMMIT_NOTES_CHARS);
}

function normalizeCommitDescription(value: unknown): string {
  return safeString(value, '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim()
    .slice(0, MAX_COMMIT_DESCRIPTION_CHARS);
}

function buildCommitMessageStyleInstruction(style: AiCommitMessageStyle): string {
  if (style === 'plain') {
    return 'Style: plain. Use a short imperative title without a Conventional Commits prefix. Keep the description empty unless it adds important context.';
  }

  if (style === 'detailed') {
    return 'Style: detailed. Use a concise imperative title and a useful description with 1-4 short lines when the notes contain multiple concrete details. Do not pad the description.';
  }

  return [
    'Style: Conventional Commits.',
    'Use "type(scope): summary" when the scope is clear, otherwise "type: summary".',
    'Allowed types: feat, fix, docs, style, refactor, perf, test, build, ci, chore.',
  ].join(' ');
}

function buildFallbackCommitMessageFromNotes(notes: string, style: AiCommitMessageStyle): CommitMessage {
  const firstUsefulLine = notes
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*]\s+/, '').trim())
    .find(Boolean);

  const summary = (firstUsefulLine || 'update changes')
    .replace(/[.!?]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  const lowerSummary = summary ? summary.charAt(0).toLowerCase() + summary.slice(1) : 'update changes';
  const title = style === 'conventional'
    ? clipCommitTitle(`chore: ${lowerSummary}`)
    : clipCommitTitle(lowerSummary);

  const description = normalizeCommitDescription(notes);
  return {
    title,
    description: description === firstUsefulLine ? '' : description,
  };
}

export class AiService {
  constructor(private readonly gitService: GitService) {}

  async testConnection(settings: AppSettings, getGeminiApiKey: () => string): Promise<{ ok: true; provider: AiProvider; model: string; detail: string }> {
    if (settings.aiProvider === 'gemini') {
      const apiKey = getGeminiApiKey().trim();
      if (!apiKey) {
        throw new Error('Gemini API key fehlt.');
      }

      const model = normalizeGeminiModel(settings.geminiModel);
      if (!model) {
        throw new Error('Gemini Modell fehlt.');
      }

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}?key=${encodeURIComponent(apiKey)}`);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Gemini nicht erreichbar (${response.status}): ${text || response.statusText}`);
      }

      return { ok: true, provider: 'gemini', model, detail: 'Gemini API erreichbar' };
    }

    const response = await fetch(`${settings.ollamaBaseUrl}/api/version`);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Ollama nicht erreichbar (${response.status}): ${text || response.statusText}`);
    }

    const json = (await response.json()) as { version?: unknown };
    return { ok: true, provider: 'ollama', model: settings.ollamaModel, detail: `Ollama ${safeString(json.version, 'unknown')}` };
  }

  async listModels(settings: AppSettings, getGeminiApiKey: () => string): Promise<string[]> {
    if (settings.aiProvider === 'gemini') {
      const apiKey = getGeminiApiKey().trim();
      if (!apiKey) {
        throw new Error('Gemini API key fehlt.');
      }

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Gemini Modelle konnten nicht geladen werden (${response.status}): ${text || response.statusText}`);
      }

      const data = (await response.json()) as { models?: Array<{ name?: unknown; supportedGenerationMethods?: unknown }> };
      const models = Array.isArray(data.models) ? data.models : [];
      return uniqueSorted(
        models
          .filter(model => {
            const methods = Array.isArray(model.supportedGenerationMethods) ? model.supportedGenerationMethods : [];
            return methods.includes('generateContent');
          })
          .map(model => normalizeGeminiModel(safeString(model.name)))
          .filter(Boolean),
      );
    }

    const response = await fetch(`${settings.ollamaBaseUrl}/api/tags`);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Ollama Modelle konnten nicht geladen werden (${response.status}): ${text || response.statusText}`);
    }

    const data = (await response.json()) as { models?: Array<{ name?: unknown; model?: unknown }> };
    const models = Array.isArray(data.models) ? data.models : [];
    return uniqueSorted(
      models
        .map(model => safeString(model.name || model.model).trim())
        .filter(Boolean),
    );
  }

  async generateCommitMessageFromUserNotes(
    settings: AppSettings,
    getGeminiApiKey: () => string,
    params: { notes: string },
  ): Promise<CommitMessage> {
    const notes = normalizeUserCommitNotes(params?.notes);
    if (!notes) {
      throw new Error('Bitte beschreibe die Aenderungen fuer die Commit-Message.');
    }

    const model = getSelectedModel(settings);
    if (!model) {
      throw new Error('Kein KI-Modell konfiguriert.');
    }

    if (settings.aiProvider === 'gemini') {
      const apiKey = getGeminiApiKey().trim();
      if (!apiKey) {
        throw new Error('Gemini API key fehlt.');
      }
    }

    const systemPrompt = [
      'You write git commit messages from user-supplied change notes only.',
      'Do not infer repository state, file names, diffs, implementation details, or unstated intent.',
      'Return strict JSON only: {"title": string, "description": string}.',
      'Title must be imperative, <=72 chars, and have no trailing period.',
      'Description may be empty. When present, keep it factual and concise.',
      'Preserve the language of the user notes unless the notes are mixed; then prefer English.',
      buildCommitMessageStyleInstruction(settings.aiCommitMessageStyle),
    ].join(' ');

    const userPrompt = [
      'User change notes:',
      notes,
      'Return JSON only.',
    ].join('\n');

    const raw = await runProviderText(settings, systemPrompt, userPrompt, getGeminiApiKey);
    const parsed = parseJsonFromText(raw) || {};
    const titleRaw = safeString(parsed.title, '').trim();
    if (!titleRaw) {
      return buildFallbackCommitMessageFromNotes(notes, settings.aiCommitMessageStyle);
    }

    return {
      title: clipCommitTitle(titleRaw),
      description: normalizeCommitDescription(parsed.description),
    };
  }

  async generateReleaseNotes(
    settings: AppSettings,
    getGeminiApiKey: () => string,
    params: {
      tagName: string;
      releaseName: string;
      lastReleaseTag?: string | null;
      commits: ReleaseCommitInput[];
      language: 'de' | 'en';
      versionBump: ReleaseVersionBump;
      hints?: string[];
    },
  ): Promise<string> {
    const commits = Array.isArray(params.commits) ? params.commits : [];
    const releaseTypeLabel = params.versionBump === 'major'
      ? 'Major'
      : params.versionBump === 'minor'
        ? 'Minor'
        : 'Patch';
    if (commits.length === 0) {
      return params.language === 'en'
        ? `# ${params.releaseName}\n\nThis ${releaseTypeLabel.toLowerCase()} release has no new commits since the previous release.`
        : `# ${params.releaseName}\n\nDieses ${releaseTypeLabel} Release enthaelt seit dem vorherigen Release keine neuen Commits.`;
    }

    const systemPrompt = [
      'You write high-quality software release notes in Markdown.',
      'Style: clear, factual, concise, informative, and easy to scan.',
      'Do not invent changes. Use only the provided commit data.',
      'Group related changes into meaningful sections.',
      'Include a short summary and a complete changelog section.',
      'Use the provided semantic version classification explicitly in the opening summary.',
    ].join(' ');

    const languageInstruction = params.language === 'en'
      ? 'Write in English.'
      : 'Write in German.';
    const releaseTypeInstruction = params.language === 'en'
      ? `Explicitly call this a ${releaseTypeLabel.toLowerCase()} release in the opening summary.`
      : `Bezeichne dies in der Einleitung ausdruecklich als ${releaseTypeLabel} Release.`;
    const majorReleaseInstruction = params.versionBump === 'major'
      ? 'Give supported breaking changes and migration requirements high visibility, but do not invent any.'
      : 'Do not infer breaking changes or compatibility claims from the release type alone.';
    const hintLines = Array.isArray(params.hints)
      ? params.hints.filter((hint) => typeof hint === 'string' && hint.trim().length > 0).slice(0, 12)
      : [];

    const userPrompt = [
      `Release name: ${params.releaseName}`,
      `Release tag: ${params.tagName}`,
      `Previous release tag: ${params.lastReleaseTag || 'none'}`,
      `Semantic version change: ${params.versionBump}`,
      languageInstruction,
      releaseTypeInstruction,
      majorReleaseInstruction,
      ...(hintLines.length > 0
        ? [
            'Additional style instructions:',
            ...hintLines.map((hint) => `- ${hint}`),
          ]
        : []),
      'Commits:',
      ...commits.map((commit) => `- ${commit.shortHash} | ${commit.subject} | ${commit.author} | ${commit.date}`),
      'Output valid Markdown only.',
    ].join('\n');

    try {
      const result = await runProviderText(settings, systemPrompt, userPrompt, getGeminiApiKey);
      const markdown = result.trim();
      if (markdown) return markdown;
    } catch {
      // Fallback below
    }

    const heading = `# ${params.releaseName}`;
    const intro = params.language === 'en'
      ? `\n\nRelease type: ${releaseTypeLabel}\n\nTag: \`${params.tagName}\`\n\n## Changelog\n`
      : `\n\nRelease-Typ: ${releaseTypeLabel}\n\nTag: \`${params.tagName}\`\n\n## Aenderungen\n`;
    const changelog = commits
      .map((commit) => `- ${commit.subject} (${commit.shortHash})`)
      .join('\n');

    return `${heading}${intro}${changelog}`.trim();
  }

  async runAutoCommit(
    settings: AppSettings,
    getGeminiApiKey: () => string,
    onProgress?: (update: AiProgressUpdate) => void,
    shouldCancel?: () => boolean,
  ): Promise<AiAutoCommitResult> {
    const runStartedAt = Date.now();

    const repoPath = this.gitService.getRepoPath();
    if (!repoPath) {
      throw new Error('No repository selected.');
    }

    if (!settings.aiAutoCommitEnabled) {
      throw new Error('AI Auto-Commit ist in den Einstellungen deaktiviert.');
    }

    const model = getSelectedModel(settings);
    if (!model) {
      throw new Error('Kein KI-Modell konfiguriert.');
    }

    if (settings.aiProvider === 'gemini') {
      const apiKey = getGeminiApiKey().trim();
      if (!apiKey) {
        throw new Error('Gemini API key fehlt.');
      }
    }

    let mode: ProgressMode = 'normal';
    let strategy: AutoCommitStrategy = 'standard';
    let aiBudgetRemainingMs = Number.POSITIVE_INFINITY;
    let aiBudgetExhausted = false;
    let processedFiles = 0;

    const commits: AiCommit[] = [];
    const warnings: string[] = [];
    const diagnostics: string[] = [];
    const modeTransitions: string[] = ['normal'];
    let modelTurns = 0;
    let retries = 0;
    let fallbackCommits = 0;

    const buildProgressDetails = (totalFiles: number, extra: Record<string, unknown> = {}): Record<string, unknown> => {
      const details: Record<string, unknown> = {
        mode,
        strategy,
        remainingFiles: Math.max(0, totalFiles - processedFiles),
        elapsedMs: Date.now() - runStartedAt,
        ...extra,
      };
      if (Number.isFinite(aiBudgetRemainingMs)) {
        details.aiBudgetRemainingMs = Math.max(0, Math.floor(aiBudgetRemainingMs));
      }
      return details;
    };

    const getAiTimeoutMs = (defaultTimeoutMs: number): number | null => {
      if (!Number.isFinite(aiBudgetRemainingMs)) {
        return defaultTimeoutMs;
      }
      if (aiBudgetRemainingMs < MIN_AI_CALL_BUDGET_MS) {
        return null;
      }
      return Math.max(MIN_AI_CALL_BUDGET_MS, Math.min(defaultTimeoutMs, aiBudgetRemainingMs));
    };

    const consumeAiBudget = (startedAt: number, context: string) => {
      if (!Number.isFinite(aiBudgetRemainingMs)) return;
      const wasExhausted = aiBudgetExhausted;
      aiBudgetRemainingMs = Math.max(0, aiBudgetRemainingMs - (Date.now() - startedAt));
      if (aiBudgetRemainingMs < MIN_AI_CALL_BUDGET_MS) {
        aiBudgetExhausted = true;
        if (!wasExhausted) {
          warnings.push(`KI-Budget erreicht (${context}); verbleibende Gruppen laufen deterministisch weiter.`);
        }
      }
    };

    const markAiBudgetExhausted = (context: string) => {
      if (!aiBudgetExhausted) {
        aiBudgetExhausted = true;
        warnings.push(`KI-Budget erreicht (${context}); verbleibende Gruppen laufen deterministisch weiter.`);
      }
    };

    onProgress?.({ phase: 'snapshot', message: 'Snapshot wird erstellt...', progress: 5, details: buildProgressDetails(0) });
    const ensureNotCancelled = () => {
      if (shouldCancel?.()) {
        throw new Error('KI Auto-Commit wurde abgebrochen.');
      }
    };
    ensureNotCancelled();

    const initialStatus = await this.gitService.getStatusPorcelain();
    ensureNotCancelled();
    const statusEntries = parseStatusPorcelain(initialStatus);

    if (statusEntries.some(entry => CONFLICT_CODES.has(entry.code))) {
      throw new Error('Repository hat Konflikte. Bitte zuerst aufloesen.');
    }

    if (statusEntries.length === 0) {
      throw new Error('Working Tree ist sauber. Keine Commits noetig.');
    }

    const snapshotFiles: SnapshotFile[] = statusEntries.map((entry) => {
      const pathValue = entry.path;
      const changeType = detectChangeType(entry);
      return {
        path: pathValue,
        changeType,
        additions: 0,
        deletions: 0,
        isBinary: false,
        preview: '(preview pending)',
        keyChanges: [],
        groupKey: buildGroupKey(pathValue, changeType),
        hydrated: false,
      };
    });

    if (snapshotFiles.length >= LARGE_BATCH_THRESHOLD) {
      strategy = 'large-hybrid';
      aiBudgetRemainingMs = LARGE_HYBRID_AI_BUDGET_MS;
    }

    onProgress?.({
      phase: 'snapshot',
      message: `Vorgruppierung abgeschlossen: ${snapshotFiles.length} Datei(en) erkannt`,
      progress: 14,
      details: buildProgressDetails(snapshotFiles.length, {
        processedFiles,
        remainingFiles: snapshotFiles.length,
      }),
    });

    const hydrateSnapshotFile = async (file: SnapshotFile): Promise<void> => {
      if (file.hydrated) return;
      ensureNotCancelled();

      let numstatRaw = '';
      try {
        numstatRaw = await this.gitService.runCommand(['diff', '--numstat', 'HEAD', '--', file.path]);
      } catch {
        numstatRaw = '';
      }

      const numstat = parseNumstatLine(numstatRaw.split(/\r?\n/).find(Boolean) || '');

      let previewRaw = '';
      try {
        previewRaw = await this.gitService.runCommand(['diff', '--no-color', '--unified=3', 'HEAD', '--', file.path]);
      } catch {
        previewRaw = '';
      }

      let additions = numstat.additions;
      let deletions = numstat.deletions;
      if (additions === 0 && deletions === 0 && previewRaw.trim()) {
        const derived = deriveStatsFromDiff(previewRaw);
        additions = derived.additions;
        deletions = derived.deletions;
      }

      let keyChanges = buildStructuredDiffContext(previewRaw);
      if (keyChanges.length === 0 && (file.changeType === 'untracked' || file.changeType === 'added')) {
        keyChanges = await readUntrackedSnippet(repoPath, file.path);
      }
      if (keyChanges.length === 0) {
        keyChanges = [clipContextLine(`${file.changeType} file: ${file.path}`)];
      }

      file.additions = additions;
      file.deletions = deletions;
      file.isBinary = numstat.isBinary;
      file.keyChanges = keyChanges;
      file.preview = toContextPreview(keyChanges);
      file.hydrated = true;
      ensureNotCancelled();
    };

    const hydrateLargeBatchSignals = async (files: SnapshotFile[]): Promise<void> => {
      ensureNotCancelled();
      let numstatReport = '';
      try {
        numstatReport = await this.gitService.runCommand(['diff', '--numstat', 'HEAD', '--']);
      } catch {
        numstatReport = '';
      }
      const statsByPath = parseNumstatReport(numstatReport);
      let contentPreviewBudget = 50;

      for (const file of files) {
        const stats = statsByPath.get(file.path);
        file.additions = stats?.additions ?? 0;
        file.deletions = stats?.deletions ?? 0;
        file.isBinary = stats?.isBinary ?? false;

        let keyChanges: string[] = [];
        if (
          contentPreviewBudget > 0
          && !file.isBinary
          && (file.changeType === 'untracked' || file.changeType === 'added')
        ) {
          keyChanges = await readUntrackedSnippet(repoPath, file.path);
          contentPreviewBudget -= 1;
        }
        if (keyChanges.length === 0) {
          keyChanges = [
            clipContextLine(
              `${file.changeType} in ${getTopDirectory(file.path)} (${getExtension(file.path)}) +${file.additions}/-${file.deletions}`,
            ),
          ];
        }
        file.keyChanges = keyChanges;
        file.preview = toContextPreview(keyChanges);
      }
      ensureNotCancelled();
    };

    onProgress?.({
      phase: 'grouping',
      message: `Dateien werden gruppiert (${snapshotFiles.length})...`,
      progress: 15,
      details: buildProgressDetails(snapshotFiles.length, {
        groupSize: snapshotFiles.length,
        step: strategy === 'large-hybrid' ? 'planning-groups' : 'grouping',
      }),
    });

    let groups = groupFilesDeterministically(snapshotFiles);
    if (strategy === 'large-hybrid') {
      await hydrateLargeBatchSignals(snapshotFiles);

      onProgress?.({
        phase: 'grouping',
        message: 'KI plant Commit-Gruppen (Hybrid-Modus)...',
        progress: 16,
        details: buildProgressDetails(snapshotFiles.length, { step: 'planning-groups' }),
      });

      let aiPlannedGroups: string[][] = [];
      const planTimeoutMs = getAiTimeoutMs(LARGE_HYBRID_PLAN_TIMEOUT_MS);
      if (planTimeoutMs == null) {
        markAiBudgetExhausted('Gruppenplanung');
      } else {
        try {
          ensureNotCancelled();
          modelTurns += 1;
          const aiCallStartedAt = Date.now();
          aiPlannedGroups = await planGroupsWithAi(
            settings,
            snapshotFiles,
            getGeminiApiKey,
            shouldCancel,
            planTimeoutMs,
          );
          consumeAiBudget(aiCallStartedAt, 'Gruppenplanung');
          ensureNotCancelled();
        } catch (error: unknown) {
          diagnostics.push(error instanceof Error ? error.message : 'KI-Gruppenplanung fehlgeschlagen.');
        }
      }

      if (aiPlannedGroups.length > 0) {
        const byPath = new Map(snapshotFiles.map((file) => [file.path, file]));
        groups = aiPlannedGroups
          .map((groupPaths) => groupPaths.map((pathValue) => byPath.get(pathValue)).filter((file): file is SnapshotFile => Boolean(file)))
          .filter((group) => group.length > 0);
      } else {
        warnings.push('Hybrid-Gruppenplanung ungueltig oder unvollstaendig; deterministische Gruppierung aktiv.');
        onProgress?.({
          phase: 'fallback',
          message: 'Deterministische Gruppenplanung aktiv (Hybrid-Fallback).',
          details: buildProgressDetails(snapshotFiles.length, { step: 'deterministic-fallback' }),
        });
      }
    }

    const groupQueues = groups.map(group => [...group]);


    for (let groupIndex = 0; groupIndex < groupQueues.length; groupIndex += 1) {
      const queue = groupQueues[groupIndex];
      if (queue.length === 0) continue;

      let groupRetries = 0;
      let stallCycles = 0;

      while (queue.length > 0) {
        ensureNotCancelled();
        if (Date.now() - runStartedAt > RUN_TIMEOUT_MS) {
          warnings.push('Zeitbudget erreicht; verbleibende Dateien werden im Ergebnis ausgewiesen.');
          break;
        }

        const remainingBeforeBatch = snapshotFiles.length - processedFiles;
        if (strategy === 'large-hybrid' && remainingBeforeBatch <= STANDARD_BATCH_THRESHOLD) {
          strategy = 'standard';
          onProgress?.({
            phase: 'grouping',
            message: `Strategiewechsel: Standard-Modus aktiv (${remainingBeforeBatch} Datei(en) verbleibend).`,
            details: buildProgressDetails(snapshotFiles.length, {
              groupId: groupIndex + 1,
              groupSize: queue.length,
              step: 'strategy-switch',
            }),
          });
        }

        const phase: ProgressPhase = mode === 'fallback' ? 'fallback' : mode === 'retry' ? 'retry' : 'committing';
        const windowFiles = pickWindow(queue, mode);

        onProgress?.({
          phase,
          message: `Gruppe ${groupIndex + 1}/${groupQueues.length}: ${windowFiles.length} Datei(en) werden vorbereitet`,
          progress: Math.min(95, 20 + Math.floor((processedFiles / Math.max(1, snapshotFiles.length)) * 70)),
          details: buildProgressDetails(snapshotFiles.length, {
            groupId: groupIndex + 1,
            groupSize: queue.length,
            step: strategy === 'large-hybrid' ? 'hybrid-window' : 'standard-window',
          }),
        });

        if (strategy === 'standard') {
          for (const file of windowFiles) {
            await hydrateSnapshotFile(file);
          }
        }
        ensureNotCancelled();

        let selectedPaths: string[] = [];

        if (mode === 'fallback') {
          selectedPaths = windowFiles.map(file => file.path).slice(0, MAX_COMMIT_FILES_FALLBACK);
        } else if (strategy === 'large-hybrid' || aiBudgetExhausted) {
          selectedPaths = windowFiles.map(file => file.path);
          if (aiBudgetExhausted) {
            onProgress?.({
              phase: 'fallback',
              message: 'Deterministische Dateiauswahl aktiv (KI-Budget erreicht).',
              details: buildProgressDetails(snapshotFiles.length, {
                groupId: groupIndex + 1,
                groupSize: queue.length,
                step: 'deterministic-fallback',
              }),
            });
          }
        } else {
          try {
            onProgress?.({
              phase: 'grouping',
              message: `KI waehlt Dateien fuer Gruppe ${groupIndex + 1}/${groupQueues.length}...`,
              details: buildProgressDetails(snapshotFiles.length, {
                groupId: groupIndex + 1,
                groupSize: queue.length,
                step: 'selecting-files',
              }),
            });
            ensureNotCancelled();
            modelTurns += 1;
            const selectTimeoutMs = getAiTimeoutMs(LARGE_HYBRID_SELECT_TIMEOUT_MS);
            if (selectTimeoutMs == null) {
              markAiBudgetExhausted('Dateiauswahl');
              selectedPaths = windowFiles.map(file => file.path);
            } else {
              const aiCallStartedAt = Date.now();
              selectedPaths = await chooseFilesWithAi(
                settings,
                windowFiles,
                getGeminiApiKey,
                shouldCancel,
                selectTimeoutMs,
              );
              consumeAiBudget(aiCallStartedAt, 'Dateiauswahl');
            }
            ensureNotCancelled();
          } catch (error: unknown) {
            diagnostics.push(error instanceof Error ? error.message : 'KI-Auswahl fehlgeschlagen.');
            selectedPaths = [];
          }
        }

        if (selectedPaths.length === 0) {
          stallCycles += 1;
          if (stallCycles >= MAX_GROUP_STALL_CYCLES) {
            const message = `Gruppe ${groupIndex + 1} wurde nach ${stallCycles} erfolglosen Auswahl-/Retry-Zyklen uebersprungen.`;
            warnings.push(message);
            onProgress?.({
              phase: 'fallback',
              message,
              details: buildProgressDetails(snapshotFiles.length, {
                groupId: groupIndex + 1,
                groupSize: queue.length,
                stallCycles,
              }),
            });
            break;
          }
          if (groupRetries < MAX_RETRIES_PER_GROUP) {
            groupRetries += 1;
            retries += 1;
            if (mode !== 'retry') {
              mode = 'retry';
              modeTransitions.push('retry');
            }
            onProgress?.({
              phase: 'retry',
              message: `Keine Auswahl erhalten, Retry ${groupRetries}/${MAX_RETRIES_PER_GROUP}`,
              details: buildProgressDetails(snapshotFiles.length, {
                groupId: groupIndex + 1,
                groupSize: queue.length,
                retryCount: groupRetries,
              }),
            });
            continue;
          }

          if (mode !== 'fallback') {
            mode = 'fallback';
            modeTransitions.push('fallback');
          }
          onProgress?.({
            phase: 'fallback',
            message: 'Auto-Fallback aktiv: Mikro-Batches werden verwendet.',
            details: buildProgressDetails(snapshotFiles.length, {
              groupId: groupIndex + 1,
              groupSize: queue.length,
              step: 'deterministic-fallback',
            }),
          });
          continue;
        }

        const selectedSet = new Set(selectedPaths);
        const batchFiles = queue.filter(file => selectedSet.has(file.path));

        if (batchFiles.length === 0) {
          stallCycles += 1;
          warnings.push(`Gruppe ${groupIndex + 1}: KI-Auswahl enthielt keine gueltigen Pfade.`);
          if (stallCycles >= MAX_GROUP_STALL_CYCLES) {
            const message = `Gruppe ${groupIndex + 1} wurde wegen wiederholt ungueltiger Auswahl uebersprungen.`;
            warnings.push(message);
            onProgress?.({
              phase: 'fallback',
              message,
              details: buildProgressDetails(snapshotFiles.length, {
                groupId: groupIndex + 1,
                groupSize: queue.length,
                stallCycles,
              }),
            });
            break;
          }
          if (groupRetries < MAX_RETRIES_PER_GROUP) {
            groupRetries += 1;
            retries += 1;
            if (mode !== 'retry') {
              mode = 'retry';
              modeTransitions.push('retry');
            }
            continue;
          }
          if (mode !== 'fallback') {
            mode = 'fallback';
            modeTransitions.push('fallback');
          }
          continue;
        }

        try {
          if (typeof (this.gitService as any).stagePaths === 'function') {
            await this.gitService.stagePaths(batchFiles.map((file) => file.path));
            ensureNotCancelled();
          } else {
            for (const file of batchFiles) {
              await this.gitService.runCommand(['add', '--', file.path]);
              ensureNotCancelled();
            }
          }

          let message: CommitMessage;
          if (aiBudgetExhausted) {
            message = buildFallbackCommitMessage(batchFiles);
          } else {
            try {
              onProgress?.({
                phase: 'committing',
                message: `KI erstellt Commit-Message fuer ${batchFiles.length} Datei(en)...`,
                details: buildProgressDetails(snapshotFiles.length, {
                  groupId: groupIndex + 1,
                  groupSize: queue.length,
                  step: 'generating-message',
                }),
              });
              ensureNotCancelled();
              modelTurns += 1;
              const messageTimeoutMs = strategy === 'large-hybrid'
                ? getAiTimeoutMs(LARGE_HYBRID_MESSAGE_TIMEOUT_MS)
                : CHAT_TIMEOUT_MS;

              if (messageTimeoutMs == null) {
                markAiBudgetExhausted('Commit-Message');
                message = buildFallbackCommitMessage(batchFiles);
              } else {
                const aiCallStartedAt = Date.now();
                message = await generateCommitMessageWithAi(
                  settings,
                  batchFiles,
                  getGeminiApiKey,
                  shouldCancel,
                  messageTimeoutMs,
                );
                consumeAiBudget(aiCallStartedAt, 'Commit-Message');
              }
              ensureNotCancelled();
            } catch (error: unknown) {
              diagnostics.push(error instanceof Error ? error.message : 'Commit-Message KI fehlgeschlagen.');
              message = buildFallbackCommitMessage(batchFiles);
            }
          }

          const batchPaths = batchFiles.map((file) => file.path);
          if (typeof (this.gitService as any).commitWithMessageForPaths === 'function') {
            await this.gitService.commitWithMessageForPaths({
              title: message.title,
              description: message.description,
            }, batchPaths);
          } else if (typeof (this.gitService as any).commitWithMessageAtPath === 'function' && typeof this.gitService.getRepoPath === 'function') {
            const repoPath = this.gitService.getRepoPath();
            if (!repoPath) {
              throw new Error('Repository path is required.');
            }
            await this.gitService.commitWithMessageAtPath(repoPath, {
              title: message.title,
              description: message.description,
            }, batchPaths);
          } else if (typeof (this.gitService as any).commitWithMessage === 'function' && batchPaths.length === 0) {
            await this.gitService.commitWithMessage({
              title: message.title,
              description: message.description,
            });
          } else {
            const commitArgs = ['commit', '-m', message.title];
            if (message.description.trim()) {
              commitArgs.push('-m', message.description.trim());
            }
            commitArgs.push('--', ...batchPaths);
            await this.gitService.runCommand(commitArgs);
          }
          ensureNotCancelled();

          const hash = (await this.gitService.runCommand(['rev-parse', '--short', 'HEAD'])).trim();
          const subject = (await this.gitService.runCommand(['show', '-s', '--format=%s', 'HEAD'])).trim();
          commits.push({ hash, subject });

          const committedPaths = new Set(batchFiles.map(file => file.path));
          for (let i = queue.length - 1; i >= 0; i -= 1) {
            if (committedPaths.has(queue[i].path)) {
              queue.splice(i, 1);
            }
          }

          processedFiles += batchFiles.length;
          if (mode === 'fallback') {
            fallbackCommits += 1;
          }

          groupRetries = 0;
          stallCycles = 0;
          if (mode !== 'normal') {
            mode = 'normal';
            modeTransitions.push('normal');
          }

          onProgress?.({
            phase: 'committing',
            message: `Commit erstellt: ${subject}`,
            details: buildProgressDetails(snapshotFiles.length, {
              groupId: groupIndex + 1,
              groupSize: queue.length,
              lastCommit: `${hash} ${subject}`,
            }),
          });
        } catch (error: unknown) {
          diagnostics.push(error instanceof Error ? error.message : 'Commit fehlgeschlagen.');
          stallCycles += 1;
          if (stallCycles >= MAX_GROUP_STALL_CYCLES) {
            const message = `Gruppe ${groupIndex + 1} wird nach ${stallCycles} wiederholten Commit-Fehlern uebersprungen.`;
            warnings.push(message);
            onProgress?.({
              phase: 'fallback',
              message,
              details: buildProgressDetails(snapshotFiles.length, {
                groupId: groupIndex + 1,
                groupSize: queue.length,
                stallCycles,
              }),
            });
            break;
          }

          if (groupRetries < MAX_RETRIES_PER_GROUP) {
            groupRetries += 1;
            retries += 1;
            if (mode !== 'retry') {
              mode = 'retry';
              modeTransitions.push('retry');
            }
            continue;
          }

          if (mode !== 'fallback') {
            mode = 'fallback';
            modeTransitions.push('fallback');
          }
          warnings.push(`Gruppe ${groupIndex + 1}: Wechsel auf Fallback nach Commit-Fehler.`);
        }
      }

      if (Date.now() - runStartedAt > RUN_TIMEOUT_MS) {
        break;
      }
    }

    const finalStatus = await this.gitService.getStatusPorcelain();
    const remainingEntries = parseStatusPorcelain(finalStatus);
    const remainingFiles = remainingEntries.length;

    const summary = commits.length === 0
      ? 'Keine Commits erstellt.'
      : `KI Auto-Commit abgeschlossen: ${commits.length} Commit(s) erstellt.`;

    onProgress?.({
      phase: 'done',
      message: summary,
      progress: 100,
      details: buildProgressDetails(snapshotFiles.length, {
        remainingFiles,
        processedFiles,
        lastCommit: commits.length > 0 ? `${commits[commits.length - 1].hash} ${commits[commits.length - 1].subject}` : null,
      }),
    });

    return {
      commits,
      summary,
      turns: modelTurns,
      modeTransitions,
      processedFiles,
      remainingFiles,
      commitPlanStats: {
        groupCount: groups.length,
        retries,
        fallbackCommits,
        totalCommits: commits.length,
        totalFilesProcessed: processedFiles,
      },
      warnings,
      diagnostics,
    };
  }
}

export const aiService = new AiService(gitService);

