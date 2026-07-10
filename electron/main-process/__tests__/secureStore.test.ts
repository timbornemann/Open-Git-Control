import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isSecureStorageAvailable } from '../secureStore';

const { getSelectedStorageBackendMock, isEncryptionAvailableMock } = vi.hoisted(() => ({
  getSelectedStorageBackendMock: vi.fn(),
  isEncryptionAvailableMock: vi.fn(),
}));

vi.mock('electron', () => ({
  app: { getPath: vi.fn() },
  safeStorage: {
    getSelectedStorageBackend: getSelectedStorageBackendMock,
    isEncryptionAvailable: isEncryptionAvailableMock,
  },
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
