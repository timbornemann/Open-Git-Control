import type { GitJobEventDto } from '@/types/aiDtos';
import { parseGitTransferProgressLine } from '@/utils/gitTransferProgress';

const isTransferProgressOperation = (operation: string): boolean => operation === 'git:clone' || operation === 'git:fetch' || operation === 'git:pull';

export const compactTransferProgressJobs = (jobs: GitJobEventDto[], event: GitJobEventDto): GitJobEventDto[] => {
  if (event.status !== 'progress' || !isTransferProgressOperation(event.operation)) {
    return [event, ...jobs].slice(0, 200);
  }

  const parsedEvent = parseGitTransferProgressLine(event.message || '');
  if (!parsedEvent) {
    return [event, ...jobs].slice(0, 200);
  }

  return [
    event,
    ...jobs.filter((existing) => {
      if (existing.id !== event.id || existing.status !== 'progress') return true;
      const parsedExisting = parseGitTransferProgressLine(existing.message || '');
      return parsedExisting?.key !== parsedEvent.key;
    }),
  ].slice(0, 200);
};
