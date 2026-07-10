import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { AppSettings } from '../settings';
import { DEFAULT_SETTINGS, normalizeSettings } from '../settings';
import { normalizeGeminiApiKey, readSavedGeminiApiKey, readSavedOpenAiApiKey, saveGeminiApiKeySecurely } from './secureStore';
import { writeTextFileAtomically } from './atomicFile';

export type RawSettingsWithLegacyKey = Partial<AppSettings> & { geminiApiKey?: unknown };

function getSettingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}

export function readRawSettings(): RawSettingsWithLegacyKey | null {
  try {
    const raw = fs.readFileSync(getSettingsPath(), 'utf-8');
    return JSON.parse(raw) as RawSettingsWithLegacyKey;
  } catch {
    return null;
  }
}

export function readSettings(): AppSettings {
  const raw = readRawSettings();
  if (!raw) {
    return { ...DEFAULT_SETTINGS };
  }
  return normalizeSettings(raw);
}

export function writeSettings(settings: AppSettings): void {
  const normalized = normalizeSettings(settings);
  writeTextFileAtomically(getSettingsPath(), JSON.stringify(normalized, null, 2));
}

export function readSettingsWithMigration(): AppSettings {
  const rawSettings = readRawSettings();
  let settings = normalizeSettings(rawSettings);
  const legacyGeminiApiKey = normalizeGeminiApiKey(rawSettings?.geminiApiKey);
  let dirty = false;

  if (legacyGeminiApiKey) {
    const savedSecurely = saveGeminiApiKeySecurely(legacyGeminiApiKey);
    settings = normalizeSettings({
      ...(rawSettings || {}),
      hasGeminiApiKey: savedSecurely,
      hasOpenAiApiKey: settings.hasOpenAiApiKey,
    });
    dirty = true;
  } else if (rawSettings && Object.prototype.hasOwnProperty.call(rawSettings, 'geminiApiKey')) {
    settings = normalizeSettings({
      ...rawSettings,
      hasGeminiApiKey: settings.hasGeminiApiKey,
      hasOpenAiApiKey: settings.hasOpenAiApiKey,
    });
    dirty = true;
  }

  const hasSavedGeminiKey = Boolean(readSavedGeminiApiKey());
  if (settings.hasGeminiApiKey !== hasSavedGeminiKey) {
    settings = normalizeSettings({ ...settings, hasGeminiApiKey: hasSavedGeminiKey });
    dirty = true;
  }

  const hasSavedOpenAiKey = Boolean(readSavedOpenAiApiKey());
  if (settings.hasOpenAiApiKey !== hasSavedOpenAiKey) {
    settings = normalizeSettings({ ...settings, hasOpenAiApiKey: hasSavedOpenAiKey });
    dirty = true;
  }

  if (dirty) {
    writeSettings(settings);
  }

  return settings;
}

export function getGeminiApiKeyFromSecureStore(): string {
  const key = readSavedGeminiApiKey();
  if (!key) {
    throw new Error('Gemini API key fehlt. Bitte in den Einstellungen speichern.');
  }
  return key;
}

export function getOpenAiApiKeyFromSecureStore(): string {
  const key = readSavedOpenAiApiKey();
  if (!key) {
    throw new Error('OpenAI API key fehlt. Bitte in den Einstellungen speichern.');
  }
  return key;
}
