import { app, safeStorage } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

const GITHUB_TOKEN_STORE_FILE = 'github-token.bin';
const GEMINI_API_KEY_STORE_FILE = 'gemini-api-key.bin';
const MAX_GEMINI_KEY_LENGTH = 500;

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

export function saveGithubTokenSecurely(token: string): boolean {
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn('OS-backed encryption is not available. GitHub token will not be persisted.');
    return false;
  }

  const encrypted = safeStorage.encryptString(token);
  fs.writeFileSync(getGithubTokenStorePath(), encrypted, { mode: 0o600 });
  return true;
}

export function readSavedGithubToken(): string | null {
  const tokenPath = getGithubTokenStorePath();
  if (!fs.existsSync(tokenPath)) return null;
  if (!safeStorage.isEncryptionAvailable()) return null;

  try {
    const encrypted = fs.readFileSync(tokenPath);
    return safeStorage.decryptString(encrypted);
  } catch {
    return null;
  }
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
