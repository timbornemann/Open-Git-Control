export type AiProvider = 'ollama' | 'gemini' | 'openai';
export type AiCommitMessageStyle = 'conventional' | 'plain' | 'detailed';
export type AiCommitMessageLanguage = 'auto' | 'de' | 'en';
export type AppTheme =
  | 'copper-night'
  | 'midnight-teal'
  | 'graphite-blue'
  | 'forest-copper'
  | 'porcelain-light'
  | 'ember-slate'
  | 'arctic-mint'
  | 'mono-dark-red'
  | 'mono-light-red'
  | 'mono-dark-green'
  | 'mono-light-green';
export type SecretScanStrictness = 'low' | 'medium' | 'high';

export interface AppSettings {
  theme: AppTheme;
  language: 'de' | 'en';
  autoFetchIntervalMs: number;
  defaultBranch: string;
  confirmDangerousOps: boolean;
  commitTemplate: string;
  showSecondaryHistory: boolean;
  commitSignoffByDefault: boolean;
  autoUpdateEnabled: boolean;
  secretScanBeforeCommitEnabled: boolean;
  secretScanBeforePushEnabled: boolean;
  secretScanStrictness: SecretScanStrictness;
  secretScanAllowlist: string;
  aiAutoCommitEnabled: boolean;
  aiProvider: AiProvider;
  aiCommitMessageStyle: AiCommitMessageStyle;
  aiCommitMessageLanguage: AiCommitMessageLanguage;
  ollamaBaseUrl: string;
  ollamaModel: string;
  geminiModel: string;
  hasGeminiApiKey: boolean;
  openAiBaseUrl: string;
  openAiModel: string;
  hasOpenAiApiKey: boolean;
  githubOauthClientId: string;
  githubHost: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'copper-night',
  language: 'en',
  autoFetchIntervalMs: 60_000,
  defaultBranch: 'main',
  confirmDangerousOps: true,
  commitTemplate: '',
  showSecondaryHistory: true,
  commitSignoffByDefault: false,
  autoUpdateEnabled: true,
  secretScanBeforeCommitEnabled: true,
  secretScanBeforePushEnabled: true,
  secretScanStrictness: 'medium',
  secretScanAllowlist: '',
  aiAutoCommitEnabled: false,
  aiProvider: 'ollama',
  aiCommitMessageStyle: 'conventional',
  aiCommitMessageLanguage: 'auto',
  ollamaBaseUrl: 'http://127.0.0.1:11434',
  ollamaModel: '',
  geminiModel: 'gemini-3-flash-preview',
  hasGeminiApiKey: false,
  openAiBaseUrl: 'https://api.openai.com/v1',
  openAiModel: 'gpt-4.1-mini',
  hasOpenAiApiKey: false,
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
const MAX_SECRET_SCAN_ALLOWLIST_LENGTH = 8_000;

function normalizeTheme(value: unknown): AppSettings['theme'] {
  switch (value) {
    case 'copper-night':
    case 'midnight-teal':
    case 'graphite-blue':
    case 'forest-copper':
    case 'porcelain-light':
    case 'ember-slate':
    case 'arctic-mint':
    case 'mono-dark-red':
    case 'mono-light-red':
    case 'mono-dark-green':
    case 'mono-light-green':
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
  if (value === 'de' || value === 'en') return value;
  return DEFAULT_SETTINGS.language;
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
  if (value === 'gemini' || value === 'openai') return value;
  return 'ollama';
}

function normalizeAiCommitMessageStyle(value: unknown): AiCommitMessageStyle {
  if (value === 'plain' || value === 'detailed') {
    return value;
  }
  return 'conventional';
}

function normalizeAiCommitMessageLanguage(value: unknown): AiCommitMessageLanguage {
  if (value === 'de' || value === 'en') {
    return value;
  }
  return 'auto';
}

function normalizeSecretScanStrictness(value: unknown): SecretScanStrictness {
  if (value === 'low' || value === 'high') {
    return value;
  }
  return 'medium';
}

function normalizeSecretScanAllowlist(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  if (value.length <= MAX_SECRET_SCAN_ALLOWLIST_LENGTH) {
    return value;
  }
  return value.slice(0, MAX_SECRET_SCAN_ALLOWLIST_LENGTH);
}

function normalizeHttpBaseUrl(value: unknown, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }

  const capped = trimmed.slice(0, MAX_OLLAMA_BASE_URL_LENGTH).replace(/\/+$/, '');
  try {
    const parsed = new URL(capped);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol !== 'http:' && protocol !== 'https:') {
      return fallback;
    }
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return fallback;
  }
}

function normalizeOllamaBaseUrl(value: unknown): string {
  return normalizeHttpBaseUrl(value, DEFAULT_SETTINGS.ollamaBaseUrl);
}

function normalizeOpenAiBaseUrl(value: unknown): string {
  if (typeof value !== 'string') {
    return DEFAULT_SETTINGS.openAiBaseUrl;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return DEFAULT_SETTINGS.openAiBaseUrl;
  }

  try {
    const parsed = new URL(trimmed.slice(0, MAX_OLLAMA_BASE_URL_LENGTH));
    // An OpenAI API key must never be sent over an unencrypted connection.
    // Credentials in the URL are disallowed as well, so an endpoint cannot
    // smuggle a second authentication mechanism into an API-key request.
    if (parsed.protocol.toLowerCase() !== 'https:' || parsed.username || parsed.password) {
      return DEFAULT_SETTINGS.openAiBaseUrl;
    }
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return DEFAULT_SETTINGS.openAiBaseUrl;
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
    autoUpdateEnabled: normalizeBoolean(value.autoUpdateEnabled, DEFAULT_SETTINGS.autoUpdateEnabled),
    secretScanBeforeCommitEnabled: normalizeBoolean(value.secretScanBeforeCommitEnabled, DEFAULT_SETTINGS.secretScanBeforeCommitEnabled),
    secretScanBeforePushEnabled: normalizeBoolean(value.secretScanBeforePushEnabled, DEFAULT_SETTINGS.secretScanBeforePushEnabled),
    secretScanStrictness: normalizeSecretScanStrictness(value.secretScanStrictness),
    secretScanAllowlist: normalizeSecretScanAllowlist(value.secretScanAllowlist),
    aiAutoCommitEnabled: normalizeBoolean(value.aiAutoCommitEnabled, DEFAULT_SETTINGS.aiAutoCommitEnabled),
    aiProvider: normalizeAiProvider(value.aiProvider),
    aiCommitMessageStyle: normalizeAiCommitMessageStyle(value.aiCommitMessageStyle),
    aiCommitMessageLanguage: normalizeAiCommitMessageLanguage(value.aiCommitMessageLanguage),
    ollamaBaseUrl: normalizeOllamaBaseUrl(value.ollamaBaseUrl),
    ollamaModel: normalizeModel(value.ollamaModel),
    geminiModel: normalizeModel(value.geminiModel, DEFAULT_SETTINGS.geminiModel),
    hasGeminiApiKey: normalizeBoolean(value.hasGeminiApiKey, false),
    openAiBaseUrl: normalizeOpenAiBaseUrl(value.openAiBaseUrl),
    openAiModel: normalizeModel(value.openAiModel, DEFAULT_SETTINGS.openAiModel),
    hasOpenAiApiKey: normalizeBoolean(value.hasOpenAiApiKey, false),
    githubOauthClientId: normalizeGithubOauthClientId(value.githubOauthClientId),
    githubHost: normalizeGithubHost(value.githubHost),
  };
}
