import type { UpdateInfo } from 'electron-updater';

export type PendingRelease = {
  version: string | null;
};

const rawUpdaterError = (error: unknown): string => {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (typeof error === 'string' && error.trim()) return error.trim();
  return '';
};

export const pendingReleaseFromError = (error: unknown): PendingRelease | null => {
  const message = rawUpdaterError(error);
  if (!/Cannot find\s+latest(?:-mac|-linux)?\.ya?ml\s+in the latest release artifacts/i.test(message)) return null;

  const tag = message.match(/\/releases\/download\/([^/)\s]+)\/latest(?:-mac|-linux)?\.ya?ml/i)?.[1];
  if (!tag) return { version: null };

  try {
    return { version: decodeURIComponent(tag).replace(/^v(?=\d)/i, '') || null };
  } catch {
    return { version: tag.replace(/^v(?=\d)/i, '') || null };
  }
};

export const formatUpdaterError = (error: unknown): string => {
  const message = rawUpdaterError(error);
  if (!message) return 'Unbekannter Update-Fehler.';
  if (/ERR_(?:INTERNET_DISCONNECTED|NETWORK_CHANGED|NAME_NOT_RESOLVED)|\b(?:ENOTFOUND|ECONNREFUSED|ETIMEDOUT)\b/i.test(message)) {
    return 'Der Update-Server konnte nicht erreicht werden. Bitte pruefe deine Internetverbindung und versuche es spaeter erneut.';
  }
  if (
    pendingReleaseFromError(error) ||
    /\bHttpError:?\s*\d{3}\b|Please double check that your authentication token|(?:^|\n)Headers:\s*\{/i.test(message) ||
    message.length > 500
  ) {
    return 'Die Update-Pruefung konnte nicht abgeschlossen werden. Bitte versuche es spaeter erneut.';
  }
  return message;
};

export const normalizeReleaseNotes = (releaseNotes: UpdateInfo['releaseNotes']): string | null => {
  if (!releaseNotes) return null;
  if (typeof releaseNotes === 'string') {
    const trimmed = releaseNotes.trim();
    return trimmed || null;
  }

  const normalized = releaseNotes
    .map((item) => {
      if (item && typeof item.note === 'string') return item.note.trim();
      return '';
    })
    .filter(Boolean)
    .join('\n\n')
    .trim();

  return normalized || null;
};

export const withTimeout = <T>(operation: Promise<T>, timeoutMs: number, timeoutMessage: string, onTimeout?: () => void): Promise<T> => {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      try {
        onTimeout?.();
      } catch {
        // Timeout reporting must still settle if updater cancellation throws.
      } finally {
        reject(new Error(timeoutMessage));
      }
    }, timeoutMs);

    if (typeof timeout.unref === 'function') {
      timeout.unref();
    }

    operation
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
};
