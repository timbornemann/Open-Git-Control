export type AiProvider = 'ollama' | 'gemini';
export type AppTheme = 'copper-night' | 'midnight-teal' | 'graphite-blue' | 'forest-copper' | 'porcelain-light' | 'ember-slate' | 'arctic-mint';

export interface AppSettings {
  theme: AppTheme;
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
  githubOauthClientId: string;
  githubHost: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'copper-night',
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
  githubOauthClientId: '',
  githubHost: 'github.com',
};

const MIN_FETCH_INTERVAL_MS = 10_000;
const MAX_FETCH_INTERVAL_MS = 300_000;
const MAX_COMMIT_TEMPLATE_LENGTH = 8_000;
const MAX_OLLAMA_BASE_URL_LENGTH = 500;
const MAX_MODEL_LENGTH = 200;
const MAX_GITHUB_OAUTH_CLIENT_ID_LENGTH = 200;
const MAX_GITHUB_HOST_LENGTH = 200;

function normalizeTheme(value: unknown): AppSettings['theme'] {
  switch (value) {
    case 'copper-night':
    case 'midnight-teal':
    case 'graphite-blue':
    case 'forest-copper':
    case 'porcelain-light':
    case 'ember-slate':
    case 'arctic-mint':
      return value;
    case 'dark':
      return 'copper-night';
    case 'light':
      return 'porcelain-light';
    default:
      return DEFAULT_SETTINGS.theme;
  }
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

function normalizeGithubOauthClientId(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().slice(0, MAX_GITHUB_OAUTH_CLIENT_ID_LENGTH);
}

function normalizeGithubHost(value: unknown): string {
  if (typeof value !== 'string') {
    return DEFAULT_SETTINGS.githubHost;
  }

  const trimmed = value.trim().toLowerCase().slice(0, MAX_GITHUB_HOST_LENGTH);
  if (!trimmed) {
    return DEFAULT_SETTINGS.githubHost;
  }

  const withoutProtocol = trimmed.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  if (!withoutProtocol || /[^a-z0-9.\-:]/.test(withoutProtocol)) {
    return DEFAULT_SETTINGS.githubHost;
  }

  return withoutProtocol;
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
    githubOauthClientId: normalizeGithubOauthClientId(value.githubOauthClientId),
    githubHost: normalizeGithubHost(value.githubHost),
  };
}
