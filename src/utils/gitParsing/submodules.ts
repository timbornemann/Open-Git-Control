export interface GitSubmoduleStatusEntry {
  path: string;
  commit: string;
  stateCode: 'clean' | 'uninitialized' | 'dirty' | 'conflicted' | 'unknown';
  isDirty: boolean;
  summary: string | null;
}

export function parseGitSubmoduleStatus(statusOutput: string): GitSubmoduleStatusEntry[] {
  if (!statusOutput.trim()) return [];

  return statusOutput
    .split('\n')
    .map((line) => line.replace(/\r$/, ''))
    .filter((line) => line.trim().length > 0)
    .map((line): GitSubmoduleStatusEntry | null => {
      const match = line.match(/^([-+U ])([0-9a-f]+)\s+(.+)$/i);
      if (!match) return null;

      const flag = match[1];
      const pathAndSummary = (match[3] || '').trim();
      const summaryMatch = pathAndSummary.match(/^(.*?)\s+\((.+)\)$/);
      const submodulePath = (summaryMatch?.[1] || pathAndSummary).trim();
      if (!submodulePath) return null;

      const stateCode = flag === ' ' ? 'clean' : flag === '-' ? 'uninitialized' : flag === '+' ? 'dirty' : flag === 'U' ? 'conflicted' : 'unknown';

      return {
        path: submodulePath,
        commit: match[2],
        stateCode,
        isDirty: flag === '+' || flag === 'U',
        summary: summaryMatch?.[2] || null,
      };
    })
    .filter((entry): entry is GitSubmoduleStatusEntry => entry !== null);
}
