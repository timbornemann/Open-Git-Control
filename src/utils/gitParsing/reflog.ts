import type { GitReflogEntryDto } from '@/types/git';

export function parseGitReflog(reflogOutput: string): GitReflogEntryDto[] {
  if (!reflogOutput) return [];

  return reflogOutput
    .split('\x00')
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record): GitReflogEntryDto | null => {
      const [hash = '', abbrevHash = '', selector = '', subject = '', date = ''] = record.split('\x1f');
      if (!hash || !selector) return null;
      return {
        hash: hash.trim(),
        abbrevHash: abbrevHash.trim(),
        selector: selector.trim(),
        subject: subject.trim(),
        date: date.trim(),
      };
    })
    .filter((entry): entry is GitReflogEntryDto => entry !== null);
}
