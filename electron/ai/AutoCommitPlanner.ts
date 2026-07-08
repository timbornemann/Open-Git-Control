export type AutoCommitPlanningMode = 'normal' | 'retry' | 'fallback';

export type AutoCommitPlanningFile = {
  path: string;
  groupKey: string;
  additions: number;
  deletions: number;
};

export type AutoCommitPlannerLimits = {
  maxFilesNormal: number;
  maxFilesRetry: number;
  maxFilesFallback: number;
  maxNetLinesPerCommit: number;
};

export class AutoCommitPlanner {
  constructor(private readonly limits: AutoCommitPlannerLimits) {}

  groupFilesDeterministically<TFile extends AutoCommitPlanningFile>(files: TFile[]): TFile[][] {
    const groups = new Map<string, TFile[]>();

    for (const file of files) {
      const arr = groups.get(file.groupKey) || [];
      arr.push(file);
      groups.set(file.groupKey, arr);
    }

    return [...groups.values()]
      .map(group => group.sort((a, b) => a.path.localeCompare(b.path)))
      .sort((a, b) => {
        const aSpecial = a[0]?.groupKey.startsWith('special:') ? 0 : 1;
        const bSpecial = b[0]?.groupKey.startsWith('special:') ? 0 : 1;
        if (aSpecial !== bSpecial) return aSpecial - bSpecial;
        return a[0].groupKey.localeCompare(b[0].groupKey);
      });
  }

  pickWindow<TFile extends Pick<AutoCommitPlanningFile, 'additions' | 'deletions'>>(
    group: TFile[],
    mode: AutoCommitPlanningMode,
  ): TFile[] {
    const maxFiles = mode === 'fallback'
      ? this.limits.maxFilesFallback
      : mode === 'retry'
        ? this.limits.maxFilesRetry
        : this.limits.maxFilesNormal;

    const selected: TFile[] = [];
    let netLines = 0;

    for (const file of group) {
      if (selected.length >= maxFiles) break;
      const weight = file.additions + file.deletions;
      if (selected.length > 0 && netLines + weight > this.limits.maxNetLinesPerCommit) {
        break;
      }
      selected.push(file);
      netLines += weight;
    }

    if (selected.length === 0 && group.length > 0) {
      return [group[0]];
    }

    return selected;
  }
}
