export type AiProvider = 'ollama' | 'gemini';

export interface AppSettings {
  theme: 'dark' | 'light';
  language: 'de' | 'en';
  autoFetchIntervalMs: number;
  defaultBranch: string;
  confirmDangerousOps: boolean;
  commitTemplate: string;
  showSecondaryHistory: boolean;
  commitSignoffByDefault: boolean;
  aiAutoCommitEnabled: boolean;
  aiProvider: AiProvider;
  ollamaBaseUrl: string;
  ollamaModel: string;
  geminiModel: string;
  hasGeminiApiKey: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  language: 'de',
  autoFetchIntervalMs: 60_000,
  defaultBranch: 'main',
  confirmDangerousOps: true,
  commitTemplate: '',
  showSecondaryHistory: true,
  commitSignoffByDefault: false,
  aiAutoCommitEnabled: false,
  aiProvider: 'ollama',
  ollamaBaseUrl: 'http://127.0.0.1:11434',
  ollamaModel: '',
  geminiModel: 'gemini-3-flash-preview',
  hasGeminiApiKey: false,
};

const MIN_FETCH_INTERVAL_MS = 10_000;
const MAX_FETCH_INTERVAL_MS = 300_000;
const MAX_COMMIT_TEMPLATE_LENGTH = 8_000;
const MAX_OLLAMA_BASE_URL_LENGTH = 500;
const MAX_MODEL_LENGTH = 200;

function normalizeTheme(value: unknown): AppSettings['theme'] {
  return value === 'light' ? 'light' : 'dark';
}

function normalizeLanguage(value: unknown): AppSettings['language'] {
  return value === 'en' ? 'en' : 'de';
}

function normalizeAutoFetchInterval(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_SETTINGS.autoFetchIntervalMs;
  }
  return Math.max(MIN_FETCH_INTERVAL_MS, Math.min(Math.floor(parsed), MAX_FETCH_INTERVAL_MS));
}

function normalizeDefaultBranch(value: unknown): string {
  if (typeof value !== 'string') {
    return DEFAULT_SETTINGS.defaultBranch;
  }
  const trimmed = value.trim();
  return trimmed || DEFAULT_SETTINGS.defaultBranch;
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeCommitTemplate(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  if (value.length <= MAX_COMMIT_TEMPLATE_LENGTH) {
    return value;
  }
  return value.slice(0, MAX_COMMIT_TEMPLATE_LENGTH);
}

function normalizeAiProvider(value: unknown): AiProvider {
  return value === 'gemini' ? 'gemini' : 'ollama';
}

function normalizeOllamaBaseUrl(value: unknown): string {
  if (typeof value !== 'string') {
    return DEFAULT_SETTINGS.ollamaBaseUrl;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return DEFAULT_SETTINGS.ollamaBaseUrl;
  }

  const capped = trimmed.slice(0, MAX_OLLAMA_BASE_URL_LENGTH).replace(/\/+$/, '');
  try {
    const parsed = new URL(capped);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol !== 'http:' && protocol !== 'https:') {
      return DEFAULT_SETTINGS.ollamaBaseUrl;
    }
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return DEFAULT_SETTINGS.ollamaBaseUrl;
  }
}

function normalizeModel(value: unknown, fallback = ''): string {
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim().slice(0, MAX_MODEL_LENGTH);
  return trimmed || fallback;
}

export function normalizeSettings(input: Partial<AppSettings> | null | undefined): AppSettings {
  const value = input || {};
  return {
    theme: normalizeTheme(value.theme),
    language: normalizeLanguage(value.language),
    autoFetchIntervalMs: normalizeAutoFetchInterval(value.autoFetchIntervalMs),
    defaultBranch: normalizeDefaultBranch(value.defaultBranch),
    confirmDangerousOps: normalizeBoolean(value.confirmDangerousOps, DEFAULT_SETTINGS.confirmDangerousOps),
    commitTemplate: normalizeCommitTemplate(value.commitTemplate),
    showSecondaryHistory: normalizeBoolean(value.showSecondaryHistory, DEFAULT_SETTINGS.showSecondaryHistory),
    commitSignoffByDefault: normalizeBoolean(value.commitSignoffByDefault, DEFAULT_SETTINGS.commitSignoffByDefault),
    aiAutoCommitEnabled: normalizeBoolean(value.aiAutoCommitEnabled, DEFAULT_SETTINGS.aiAutoCommitEnabled),
    aiProvider: normalizeAiProvider(value.aiProvider),
    ollamaBaseUrl: normalizeOllamaBaseUrl(value.ollamaBaseUrl),
    ollamaModel: normalizeModel(value.ollamaModel),
    geminiModel: normalizeModel(value.geminiModel, DEFAULT_SETTINGS.geminiModel),
    hasGeminiApiKey: normalizeBoolean(value.hasGeminiApiKey, false),
  };
}
