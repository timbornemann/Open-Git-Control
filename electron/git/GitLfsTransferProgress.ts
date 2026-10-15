import type { GitLfsPointer } from '../../src/shared/ipc/gitLfs';
import type { RemoteTransferContext } from './remoteTransferModels';

/** Native LFS bytes include objects already present on the server, not just network traffic. */
export function lfsProgressReporter(remote: string, objects: GitLfsPointer[] | undefined, progress: RemoteTransferContext['onProgress'], offset = 0) {
  const previousBytes = objects?.slice(0, offset).reduce((sum, object) => sum + object.size, 0) ?? 0;
  const totalBytes = objects?.reduce((sum, object) => sum + object.size, 0);
  return (message: string): boolean => {
    // eslint-disable-next-line no-control-regex -- Forced LFS progress includes ANSI erase-line sequences.
    const clean = message.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').trim();
    const match = /^Uploading LFS objects:\s*\d+%\s*\((\d+)\/(\d+)\),\s*([\d.]+)\s*([KMGT]?i?B)\s*\|\s*([\d.]+\s*[KMGT]?i?B\/s)/i.exec(clean);
    if (!match) return false;
    const unit = match[4].toUpperCase();
    const exponent = Math.max(0, 'BKMGT'.indexOf(unit[0]));
    const bytes = Number(match[3]) * (unit.includes('I') ? 1024 : 1000) ** exponent;
    const current = Number(match[1]);
    const total = Number(match[2]);
    progress?.(clean, {
      phase: total > 0 && current >= total ? 'lfs-finalizing' : 'lfs-upload',
      remote,
      processedObjects: objects ? Math.min(objects.length, offset + current) : current,
      totalObjects: objects?.length ?? total,
      ...(totalBytes !== undefined ? { processedBytes: Math.min(totalBytes, previousBytes + bytes), totalBytes } : {}),
      ...(parseFloat(match[5]) > 0 ? { speed: match[5] } : {}),
    });
    return true;
  };
}

/** Hooks remain enabled; their LFS checks and server-side publication are still part of the push. */
export function gitPushProgress(remote: string, progress: RemoteTransferContext['onProgress']) {
  const publishing = { phase: 'publishing' as const, remote };
  progress?.(`Publishing Git refs: ${remote}`, publishing);
  const lfs = lfsProgressReporter(remote, undefined, (message, transfer) => progress?.(message, transfer?.phase === 'lfs-finalizing' ? publishing : transfer));
  return (message: string) => {
    if (!lfs(message)) progress?.(message, publishing);
  };
}
