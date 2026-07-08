import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { AppSettings } from '../settings';
import { DEFAULT_SETTINGS, normalizeSettings } from '../settings';
import { normalizeGeminiApiKey, readSavedGeminiApiKey, saveGeminiApiKeySecurely } from './secureStore';

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
  fs.writeFileSync(getSettingsPath(), JSON.stringify(normalized, null, 2));
}

export function readSettingsWithMigration(): AppSettings {
  const rawSettings = readRawSettings();
  const settings = normalizeSettings(rawSettings);
  const legacyGeminiApiKey = normalizeGeminiApiKey(rawSettings?.geminiApiKey);

  if (legacyGeminiApiKey) {
    const savedSecurely = saveGeminiApiKeySecurely(legacyGeminiApiKey);
    const nextSettings = normalizeSettings({
      ...(rawSettings || {}),
      hasGeminiApiKey: savedSecurely,
    });
    writeSettings(nextSettings);
    return nextSettings;
  }

  if (rawSettings && Object.prototype.hasOwnProperty.call(rawSettings, 'geminiApiKey')) {
    const nextSettings = normalizeSettings({
      ...rawSettings,
      hasGeminiApiKey: settings.hasGeminiApiKey,
    });
    writeSettings(nextSettings);
    return nextSettings;
  }

  const hasSavedKey = Boolean(readSavedGeminiApiKey());
  if (settings.hasGeminiApiKey !== hasSavedKey) {
    const nextSettings = normalizeSettings({ ...settings, hasGeminiApiKey: hasSavedKey });
    writeSettings(nextSettings);
    return nextSettings;
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
