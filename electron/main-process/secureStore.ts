import { app, safeStorage } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

const GITHUB_TOKEN_STORE_FILE = 'github-token.bin';
const GEMINI_API_KEY_STORE_FILE = 'gemini-api-key.bin';
const PLANNING_API_TOKEN_STORE_FILE = 'planning-api-token.bin';
const MAX_GEMINI_KEY_LENGTH = 500;
const GITHUB_TOKEN_PAYLOAD_VERSION = 1;
const PLANNING_API_TOKEN_PAYLOAD_VERSION = 1;

export type SavedGithubToken = {
  token: string;
  host: string | null;
};

export type SavedPlanningApiToken = {
  token: string;
  createdAt: number;
  expiresAt: number | null;
};

export function normalizeGeminiApiKey(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().slice(0, MAX_GEMINI_KEY_LENGTH);
}

function overwriteAndDeleteFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;

  try {
    const stat = fs.statSync(filePath);
    const randomOverwrite = Buffer.alloc(stat.size);
    for (let i = 0; i < randomOverwrite.length; i += 1) {
      randomOverwrite[i] = Math.floor(Math.random() * 256);
    }
    fs.writeFileSync(filePath, randomOverwrite);
  } catch {
    // ignore and try to remove file below
  }

  try {
    fs.rmSync(filePath, { force: true });
  } catch {
    // ignore
  }
}

function getGithubTokenStorePath(): string {
  return path.join(app.getPath('userData'), GITHUB_TOKEN_STORE_FILE);
}

function getGeminiApiKeyStorePath(): string {
  return path.join(app.getPath('userData'), GEMINI_API_KEY_STORE_FILE);
}

function getPlanningApiTokenStorePath(): string {
  return path.join(app.getPath('userData'), PLANNING_API_TOKEN_STORE_FILE);
}

export function isSecureStorageAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}

export function parseSavedGithubTokenPayload(raw: string): SavedGithubToken | null {
  const value = String(raw || '').trim();
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Partial<SavedGithubToken> & { version?: unknown };
    if (
      parsed
      && parsed.version === GITHUB_TOKEN_PAYLOAD_VERSION
      && typeof parsed.token === 'string'
      && parsed.token.trim()
    ) {
      return {
        token: parsed.token.trim(),
        host: typeof parsed.host === 'string' && parsed.host.trim() ? parsed.host.trim().toLowerCase() : null,
      };
    }
  } catch {
    // Legacy payloads are plain encrypted token strings.
  }

  return { token: value, host: null };
}

export function serializeGithubTokenPayload(token: string, host: string): string {
  const normalizedToken = String(token || '').trim();
  const normalizedHost = String(host || '').trim().toLowerCase();
  if (!normalizedToken) {
    throw new Error('GitHub token is required.');
  }
  if (!normalizedHost) {
    throw new Error('GitHub host is required.');
  }

  return JSON.stringify({
    version: GITHUB_TOKEN_PAYLOAD_VERSION,
    token: normalizedToken,
    host: normalizedHost,
  });
}

export function saveGithubTokenSecurely(token: string, host = 'github.com'): boolean {
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn('OS-backed encryption is not available. GitHub token will not be persisted.');
    return false;
  }

  const encrypted = safeStorage.encryptString(serializeGithubTokenPayload(token, host));
  fs.writeFileSync(getGithubTokenStorePath(), encrypted, { mode: 0o600 });
  return true;
}

export function readSavedGithubTokenWithHost(): SavedGithubToken | null {
  const tokenPath = getGithubTokenStorePath();
  if (!fs.existsSync(tokenPath)) return null;
  if (!safeStorage.isEncryptionAvailable()) return null;

  try {
    const encrypted = fs.readFileSync(tokenPath);
    return parseSavedGithubTokenPayload(safeStorage.decryptString(encrypted));
  } catch {
    return null;
  }
}

export function readSavedGithubToken(): string | null {
  return readSavedGithubTokenWithHost()?.token || null;
}

export function clearSavedGithubTokenSecurely(): void {
  overwriteAndDeleteFile(getGithubTokenStorePath());
}

export function saveGeminiApiKeySecurely(apiKey: string): boolean {
  const normalized = normalizeGeminiApiKey(apiKey);
  if (!normalized) {
    clearSavedGeminiApiKeySecurely();
    return true;
  }

  if (!safeStorage.isEncryptionAvailable()) {
    console.warn('OS-backed encryption is not available. Gemini API key will not be persisted.');
    return false;
  }

  const encrypted = safeStorage.encryptString(normalized);
  fs.writeFileSync(getGeminiApiKeyStorePath(), encrypted, { mode: 0o600 });
  return true;
}

export function readSavedGeminiApiKey(): string | null {
  const keyPath = getGeminiApiKeyStorePath();
  if (!fs.existsSync(keyPath)) return null;
  if (!safeStorage.isEncryptionAvailable()) return null;

  try {
    const encrypted = fs.readFileSync(keyPath);
    return normalizeGeminiApiKey(safeStorage.decryptString(encrypted)) || null;
  } catch {
    return null;
  }
}

export function clearSavedGeminiApiKeySecurely(): void {
  overwriteAndDeleteFile(getGeminiApiKeyStorePath());
}

function normalizeEpochMillis(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return Math.floor(value);
}

export function isPlanningApiTokenExpired(token: Pick<SavedPlanningApiToken, 'expiresAt'>, now = Date.now()): boolean {
  return typeof token.expiresAt === 'number' && token.expiresAt <= now;
}

export function parseSavedPlanningApiTokenPayload(raw: string): SavedPlanningApiToken | null {
  const value = String(raw || '').trim();
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Partial<SavedPlanningApiToken> & { version?: unknown };
    const createdAt = normalizeEpochMillis(parsed.createdAt);
    const expiresAt = parsed.expiresAt === null ? null : normalizeEpochMillis(parsed.expiresAt);
    if (
      parsed
      && parsed.version === PLANNING_API_TOKEN_PAYLOAD_VERSION
      && typeof parsed.token === 'string'
      && parsed.token.trim().length >= 16
      && createdAt
      && (parsed.expiresAt === null || expiresAt)
    ) {
      return {
        token: parsed.token.trim(),
        createdAt,
        expiresAt,
      };
    }
  } catch {
    return null;
  }

  return null;
}

export function serializePlanningApiTokenPayload(token: SavedPlanningApiToken): string {
  const normalizedToken = String(token.token || '').trim();
  const createdAt = normalizeEpochMillis(token.createdAt);
  const expiresAt = token.expiresAt === null ? null : normalizeEpochMillis(token.expiresAt);
  if (normalizedToken.length < 16) {
    throw new Error('Planning API token must contain at least 16 characters.');
  }
  if (!createdAt) {
    throw new Error('Planning API token creation date is required.');
  }
  if (token.expiresAt !== null && !expiresAt) {
    throw new Error('Planning API token expiry date is invalid.');
  }

  return JSON.stringify({
    version: PLANNING_API_TOKEN_PAYLOAD_VERSION,
    token: normalizedToken,
    createdAt,
    expiresAt,
  });
}

export function savePlanningApiTokenSecurely(token: SavedPlanningApiToken): boolean {
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn('OS-backed encryption is not available. Planning API token will not be persisted.');
    return false;
  }

  const encrypted = safeStorage.encryptString(serializePlanningApiTokenPayload(token));
  fs.writeFileSync(getPlanningApiTokenStorePath(), encrypted, { mode: 0o600 });
  return true;
}

export function readSavedPlanningApiToken(): SavedPlanningApiToken | null {
  const tokenPath = getPlanningApiTokenStorePath();
  if (!fs.existsSync(tokenPath)) return null;
  if (!safeStorage.isEncryptionAvailable()) return null;

  try {
    const encrypted = fs.readFileSync(tokenPath);
    return parseSavedPlanningApiTokenPayload(safeStorage.decryptString(encrypted));
  } catch {
    return null;
  }
}

export function clearSavedPlanningApiTokenSecurely(): void {
  overwriteAndDeleteFile(getPlanningApiTokenStorePath());
}
