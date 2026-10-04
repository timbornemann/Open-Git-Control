import type { GitPushBatchDto, GitPushTargetDto, GitPushTargetResultDto, GitPushTargetStatus } from '../../src/types/remoteTransfers';
import type { GitProcessResult } from './GitProcessTypes';
import { redactGitSensitiveText } from './GitErrorFormatter';

export type PublishedRef = { sourceOid: string; destinationRef: string };

export function parseAdvertisedRefs(output: string): Map<string, string> {
  const refs = new Map<string, string>();
  for (const line of output.split(/\r?\n/)) {
    const [oid, ref] = line.split('\t');
    if (/^[a-f0-9]{40,64}$/i.test(oid ?? '') && ref?.startsWith('refs/')) refs.set(ref, oid);
  }
  return refs;
}

export function pushResult(target: GitPushTargetDto, result: GitProcessResult): GitPushTargetResultDto {
  const statuses: GitPushTargetStatus[] = [];
  const messages: string[] = [];
  const refResults: NonNullable<GitPushTargetResultDto['refResults']> = [];
  for (const line of result.stdout.split(/\r?\n/)) {
    const parts = line.split('\t');
    if (parts.length < 3 || ![' ', '=', '*', '+', '-', '!'].includes(parts[0])) continue;
    const status = parts[0] === '=' ? 'up-to-date' : parts[0] === '!' ? 'rejected' : 'success';
    const [sourceOid, ...destination] = parts[1].split(':');
    const destinationRef = destination.join(':');
    statuses.push(status);
    messages.push(`${destinationRef}: ${parts[2]}`);
    refResults.push({ destinationRef, sourceOid, status, message: redactGitSensitiveText(parts[2]) });
  }
  const rejected = statuses.includes('rejected');
  const published = statuses.some((status) => status === 'success');
  const status: GitPushTargetStatus =
    rejected && published
      ? 'unknown'
      : rejected
        ? 'rejected'
        : result.exitCode !== 0
          ? 'unknown'
          : published
            ? 'success'
            : statuses.length
              ? 'up-to-date'
              : 'unknown';
  const message =
    messages.join('\n') ||
    result.stderr.trim() ||
    (result.exitCode === 0 ? 'Git completed without ref status records; verify this endpoint before retrying.' : 'Git could not confirm publication.');
  return { ...target, status, message: redactGitSensitiveText(message).slice(0, 16_384), refResults };
}

export function batchState(targets: GitPushTargetResultDto[], cancelled: boolean): GitPushBatchDto['state'] {
  if (cancelled) return 'cancelled';
  const successful = targets.filter((target) => target.status === 'success' || target.status === 'up-to-date').length;
  const completedRefs = successful > 0 || targets.some((target) => target.refResults?.some((ref) => ref.status === 'success' || ref.status === 'up-to-date'));
  return successful === targets.length ? 'success' : completedRefs ? 'partial' : 'failed';
}
