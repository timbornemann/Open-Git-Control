import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearSavedGeminiApiKeySecurely,
  clearSavedGithubTokenSecurely,
  clearSavedOpenAiApiKeySecurely,
  clearSavedPlanningApiTokenSecurely,
  isSecureStorageAvailable,
  parseSavedGithubTokenPayload,
} from '../secureStore';

const { existsSyncMock, getPathMock, getSelectedStorageBackendMock, isEncryptionAvailableMock, rmSyncMock, statSyncMock, writeFileSyncMock } = vi.hoisted(
  () => ({
    existsSyncMock: vi.fn(),
    getPathMock: vi.fn(),
    getSelectedStorageBackendMock: vi.fn(),
    isEncryptionAvailableMock: vi.fn(),
    rmSyncMock: vi.fn(),
    statSyncMock: vi.fn(),
    writeFileSyncMock: vi.fn(),
  }),
);

vi.mock('electron', () => ({
  app: { getPath: getPathMock },
  safeStorage: {
    getSelectedStorageBackend: getSelectedStorageBackendMock,
    isEncryptionAvailable: isEncryptionAvailableMock,
  },
}));

vi.mock('fs', () => ({
  existsSync: existsSyncMock,
  readFileSync: vi.fn(),
  rmSync: rmSyncMock,
  statSync: statSyncMock,
  writeFileSync: writeFileSyncMock,
}));

const originalPlatform = process.platform;

const setPlatform = (platform: NodeJS.Platform): void => {
  Object.defineProperty(process, 'platform', { configurable: true, value: platform });
};

describe('isSecureStorageAvailable', () => {
  beforeEach(() => {
    isEncryptionAvailableMock.mockReset();
    getSelectedStorageBackendMock.mockReset();
  });

  afterEach(() => {
    setPlatform(originalPlatform);
  });

  it('rejects Electron basic_text on Linux even when Electron reports encryption available', () => {
    setPlatform('linux');
    isEncryptionAvailableMock.mockReturnValue(true);
    getSelectedStorageBackendMock.mockReturnValue('basic_text');

    expect(isSecureStorageAvailable()).toBe(false);
  });

  it('accepts an OS-backed Linux backend and rejects unavailable encryption', () => {
    setPlatform('linux');
    isEncryptionAvailableMock.mockReturnValue(true);
    getSelectedStorageBackendMock.mockReturnValue('gnome_libsecret');
    expect(isSecureStorageAvailable()).toBe(true);

    isEncryptionAvailableMock.mockReturnValue(false);
    expect(isSecureStorageAvailable()).toBe(false);
    expect(getSelectedStorageBackendMock).toHaveBeenCalledTimes(1);
  });
});

describe('secure credential deletion', () => {
  beforeEach(() => {
    existsSyncMock.mockReset();
    getPathMock.mockReset();
    rmSyncMock.mockReset();
    statSyncMock.mockReset();
    writeFileSyncMock.mockReset();
    getPathMock.mockReturnValue('C:/secure-store');
    existsSyncMock.mockReturnValue(true);
    statSyncMock.mockReturnValue({ size: 32 });
  });

  it.each([
    ['GitHub token', clearSavedGithubTokenSecurely],
    ['Gemini key', clearSavedGeminiApiKeySecurely],
    ['OpenAI key', clearSavedOpenAiApiKeySecurely],
    ['Planning API token', clearSavedPlanningApiTokenSecurely],
  ])('propagates a filesystem removal failure for the %s', (_label, clearCredential) => {
    rmSyncMock.mockImplementation(() => {
      throw new Error('access denied');
    });

    expect(() => clearCredential()).toThrow('Secure credential file could not be deleted: access denied');
  });

  it('does not report success when the credential file remains after rmSync', () => {
    existsSyncMock.mockReturnValue(true);

    expect(() => clearSavedGithubTokenSecurely()).toThrow('Secure credential file still exists after deletion.');
  });

  it('returns success only after the credential file is gone', () => {
    existsSyncMock.mockReturnValueOnce(true).mockReturnValueOnce(false);

    expect(clearSavedGithubTokenSecurely()).toBe(true);
  });
});

describe('parseSavedGithubTokenPayload', () => {
  it('accepts legacy raw tokens but rejects valid JSON with an unsupported schema', () => {
    expect(parseSavedGithubTokenPayload('ghp_legacy_token')).toEqual({ token: 'ghp_legacy_token', host: null });
    expect(parseSavedGithubTokenPayload(JSON.stringify({ version: 999, token: 'ghp_future' }))).toBeNull();
    expect(parseSavedGithubTokenPayload(JSON.stringify({ version: 1, host: 'github.com' }))).toBeNull();
    expect(parseSavedGithubTokenPayload(JSON.stringify('ghp_not_a_legacy_payload'))).toBeNull();
  });
});
