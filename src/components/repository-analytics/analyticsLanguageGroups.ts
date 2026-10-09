import type { AnalyticsProject } from '@/shared/ipc/repositoryAnalytics';

export type AnalyticsLanguageGroup = AnalyticsProject['languages'][number] & { members?: string[] };

// A type with at most 0.1% of committed text lines joins the shared remainder.
export function groupAnalyticsLanguages(languages: AnalyticsProject['languages'], lines: number, otherLabel: string): AnalyticsLanguageGroup[] {
  const visible: AnalyticsLanguageGroup[] = [];
  const other: AnalyticsLanguageGroup = { language: otherLabel, files: 0, lines: 0, members: [] };
  for (const language of languages) {
    if (language.lines * 1000 > lines) visible.push(language);
    else {
      other.files += language.files;
      other.lines += language.lines;
      other.members!.push(language.language);
    }
  }
  if (other.members!.length) visible.push(other);
  return visible;
}
