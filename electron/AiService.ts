import { GitService, gitService } from './GitService';
import { AppSettings, AiProvider } from './settings';

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
  groupKey: string;
  hydrated: boolean;
};

type CommitMessage = {
  title: string;
  description: string;
};

type AiCommit = {
  hash: string;
  subject: string;
};

type ProgressPhase = 'snapshot' | 'grouping' | 'committing' | 'retry' | 'fallback' | 'done' | 'failed';
type ProgressMode = 'normal' | 'retry' | 'fallback';

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

const CHAT_TIMEOUT_MS = 90_000;
const RUN_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_PREVIEW_CHARS = 220;
const MAX_COMMIT_FILES_NORMAL = 5;
const MAX_COMMIT_FILES_RETRY = 3;
const MAX_COMMIT_FILES_FALLBACK = 2;
const MAX_NET_LINES_PER_COMMIT = 450;
const MAX_RETRIES_PER_GROUP = 2;
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

function toPreview(diffText: string): string {
  return (diffText || '').replace(/\s+/g, ' ').trim().slice(0, MAX_PREVIEW_CHARS) || '(no preview available)';
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

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error: unknown) {
    if ((error as any)?.name === 'AbortError') {
      throw new Error(`KI Anfrage Zeitlimit ueberschritten (${Math.round(timeoutMs / 1000)}s).`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function runProviderText(
  settings: AppSettings,
  systemPrompt: string,
  userPrompt: string,
  getGeminiApiKey: () => string,
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
      CHAT_TIMEOUT_MS,
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
    CHAT_TIMEOUT_MS,
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
): Promise<string[]> {
  if (candidateWindow.length <= 1) {
    return candidateWindow.map(file => file.path);
  }

  const systemPrompt = [
    'You decide which files should be committed together in one small coherent commit.',
    'Return strict JSON only: {"selectedPaths": string[]} with at least 1 and at most 5 items.',
    'Only choose paths from the provided list.',
    'Prefer fine-grained commits.',
  ].join(' ');

  const userPrompt = [
    'Candidates:',
    ...candidateWindow.map((file, index) => `${index + 1}. ${file.path} | ${file.changeType} | +${file.additions}/-${file.deletions} | ${file.preview}`),
    'Return JSON only.',
  ].join('\n');

  const raw = await runProviderText(settings, systemPrompt, userPrompt, getGeminiApiKey);
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

async function generateCommitMessageWithAi(
  settings: AppSettings,
  batch: SnapshotFile[],
  getGeminiApiKey: () => string,
): Promise<CommitMessage> {
  const systemPrompt = [
    'You write concise git commit messages.',
    'Return strict JSON only: {"title": string, "description": string}.',
    'Title must be imperative, <=72 chars, no trailing period.',
    'Description should be short and optional-friendly.',
  ].join(' ');

  const userPrompt = [
    'Files in this commit:',
    ...batch.map((file) => `- ${file.path} (${file.changeType}, +${file.additions}/-${file.deletions}) ${file.preview}`),
    'Return JSON only.',
  ].join('\n');

  try {
    const raw = await runProviderText(settings, systemPrompt, userPrompt, getGeminiApiKey);
    const parsed = parseJsonFromText(raw) || {};
    const title = clipCommitTitle(safeString(parsed.title, '').trim());
    const description = safeString(parsed.description, '').trim();
    return { title, description };
  } catch {
    const first = batch[0];
    const scope = getTopDirectory(first.path);
    return {
      title: clipCommitTitle(`chore(${scope}): update ${batch.length} file${batch.length === 1 ? '' : 's'}`),
      description: '',
    };
  }
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

  async generateReleaseNotes(
    settings: AppSettings,
    getGeminiApiKey: () => string,
    params: {
      tagName: string;
      releaseName: string;
      lastReleaseTag?: string | null;
      commits: ReleaseCommitInput[];
      language: 'de' | 'en';
    },
  ): Promise<string> {
    const commits = Array.isArray(params.commits) ? params.commits : [];
    if (commits.length === 0) {
      return params.language === 'en'
        ? `# ${params.releaseName}\n\nNo new commits since the previous release.`
        : `# ${params.releaseName}\n\nSeit dem letzten Release gibt es keine neuen Commits.`;
    }

    const systemPrompt = [
      'You write high-quality software release notes in Markdown.',
      'Style: clear, factual, concise, informative, and easy to scan.',
      'Do not invent changes. Use only the provided commit data.',
      'Group related changes into meaningful sections.',
      'Include a short summary and a complete changelog section.',
    ].join(' ');

    const languageInstruction = params.language === 'en'
      ? 'Write in English.'
      : 'Write in German.';

    const userPrompt = [
      `Release name: ${params.releaseName}`,
      `Release tag: ${params.tagName}`,
      `Previous release tag: ${params.lastReleaseTag || 'none'}`,
      languageInstruction,
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
      ? `\n\nTag: \`${params.tagName}\`\n\n## Changelog\n`
      : `\n\nTag: \`${params.tagName}\`\n\n## Aenderungen\n`;
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

    onProgress?.({ phase: 'snapshot', message: 'Snapshot wird erstellt...', progress: 5, details: { mode: 'normal' } });
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
        groupKey: buildGroupKey(pathValue, changeType),
        hydrated: false,
      };
    });

    onProgress?.({
      phase: 'snapshot',
      message: `Vorgruppierung abgeschlossen: ${snapshotFiles.length} Datei(en) erkannt`,
      progress: 14,
      details: {
        mode: 'normal',
        processedFiles: snapshotFiles.length,
        remainingFiles: snapshotFiles.length,
      },
    });

    const hydrateSnapshotFile = async (file: SnapshotFile): Promise<void> => {
      if (file.hydrated) return;
      ensureNotCancelled();

      let numstatRaw = '';
      try {
        numstatRaw = await this.gitService.runCommand(['diff', '--numstat', '--', file.path]);
      } catch {
        numstatRaw = '';
      }

      if (!numstatRaw.trim()) {
        try {
          numstatRaw = await this.gitService.runCommand(['diff', '--numstat', '--cached', '--', file.path]);
        } catch {
          numstatRaw = '';
        }
      }

      const numstat = parseNumstatLine(numstatRaw.split(/\r?\n/).find(Boolean) || '');

      let previewRaw = '';
      try {
        previewRaw = await this.gitService.runCommand(['diff', '--', file.path]);
      } catch {
        previewRaw = '';
      }

      if (!previewRaw.trim()) {
        try {
          previewRaw = await this.gitService.runCommand(['diff', '--cached', '--', file.path]);
        } catch {
          previewRaw = '';
        }
      }

      file.additions = numstat.additions;
      file.deletions = numstat.deletions;
      file.isBinary = numstat.isBinary;
      file.preview = toPreview(previewRaw);
      file.hydrated = true;
      ensureNotCancelled();
    };

    onProgress?.({
      phase: 'grouping',
      message: `Dateien werden gruppiert (${snapshotFiles.length})...`,
      progress: 15,
      details: { mode: 'normal', remainingFiles: snapshotFiles.length },
    });

    const groups = groupFilesDeterministically(snapshotFiles);
    const groupQueues = groups.map(group => [...group]);

    const commits: AiCommit[] = [];
    const warnings: string[] = [];
    const diagnostics: string[] = [];
    const modeTransitions: string[] = ['normal'];
    let mode: ProgressMode = 'normal';
    let modelTurns = 0;
    let retries = 0;
    let fallbackCommits = 0;
    let processedFiles = 0;


    for (let groupIndex = 0; groupIndex < groupQueues.length; groupIndex += 1) {
      const queue = groupQueues[groupIndex];
      if (queue.length === 0) continue;

      let groupRetries = 0;

      while (queue.length > 0) {
        ensureNotCancelled();
        if (Date.now() - runStartedAt > RUN_TIMEOUT_MS) {
          warnings.push('Zeitbudget erreicht; verbleibende Dateien werden im Ergebnis ausgewiesen.');
          break;
        }

        const phase: ProgressPhase = mode === 'fallback' ? 'fallback' : mode === 'retry' ? 'retry' : 'committing';
        const windowFiles = pickWindow(queue, mode);

        onProgress?.({
          phase,
          message: `Gruppe ${groupIndex + 1}/${groupQueues.length}: ${windowFiles.length} Datei(en) werden vorbereitet`,
          progress: Math.min(95, 20 + Math.floor((processedFiles / Math.max(1, snapshotFiles.length)) * 70)),
          details: {
            mode,
            groupId: groupIndex + 1,
            groupSize: queue.length,
            remainingFiles: snapshotFiles.length - processedFiles,
          },
        });

        for (const file of windowFiles) {
          await hydrateSnapshotFile(file);
        }
        ensureNotCancelled();

        let selectedPaths: string[] = [];

        if (mode === 'fallback') {
          selectedPaths = windowFiles.map(file => file.path).slice(0, MAX_COMMIT_FILES_FALLBACK);
        } else {
          try {
            ensureNotCancelled();
            modelTurns += 1;
            selectedPaths = await chooseFilesWithAi(settings, windowFiles, getGeminiApiKey);
            ensureNotCancelled();
          } catch (error: unknown) {
            diagnostics.push(error instanceof Error ? error.message : 'KI-Auswahl fehlgeschlagen.');
            selectedPaths = [];
          }
        }

        if (selectedPaths.length === 0) {
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
              details: {
                mode,
                groupId: groupIndex + 1,
                groupSize: queue.length,
                remainingFiles: snapshotFiles.length - processedFiles,
                retryCount: groupRetries,
              },
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
            details: {
              mode,
              groupId: groupIndex + 1,
              groupSize: queue.length,
              remainingFiles: snapshotFiles.length - processedFiles,
            },
          });
          continue;
        }

        const selectedSet = new Set(selectedPaths);
        const batchFiles = queue.filter(file => selectedSet.has(file.path));

        if (batchFiles.length === 0) {
          warnings.push(`Gruppe ${groupIndex + 1}: KI-Auswahl enthielt keine gueltigen Pfade.`);
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
          for (const file of batchFiles) {
            await this.gitService.runCommand(['add', '--', file.path]);
          }

          let message: CommitMessage;
          try {
            ensureNotCancelled();
            modelTurns += 1;
            message = await generateCommitMessageWithAi(settings, batchFiles, getGeminiApiKey);
            ensureNotCancelled();
          } catch (error: unknown) {
            diagnostics.push(error instanceof Error ? error.message : 'Commit-Message KI fehlgeschlagen.');
            message = {
              title: clipCommitTitle(`chore: update ${batchFiles.length} file${batchFiles.length === 1 ? '' : 's'}`),
              description: '',
            };
          }

          const commitArgs = ['commit', '-m', message.title];
          if (message.description.trim()) {
            commitArgs.push('-m', message.description.trim());
          }

          await this.gitService.runCommand(commitArgs);
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
          if (mode !== 'normal') {
            mode = 'normal';
            modeTransitions.push('normal');
          }

          onProgress?.({
            phase: 'committing',
            message: `Commit erstellt: ${subject}`,
            details: {
              mode,
              groupId: groupIndex + 1,
              groupSize: queue.length,
              remainingFiles: snapshotFiles.length - processedFiles,
              lastCommit: `${hash} ${subject}`,
            },
          });
        } catch (error: unknown) {
          diagnostics.push(error instanceof Error ? error.message : 'Commit fehlgeschlagen.');

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
      details: {
        mode,
        remainingFiles,
        processedFiles,
        lastCommit: commits.length > 0 ? `${commits[commits.length - 1].hash} ${commits[commits.length - 1].subject}` : null,
      },
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

