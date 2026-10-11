import { STORAGE_BUDGETS, type StorageCategory, type StorageOverview, type StorageIssue } from '../../src/shared/ipc/storageMaintenance';
import type { StoredData } from './repoStore';
import { repositoryPathKey } from './activeRepositoryAuthorization';
import type { MaintenanceState } from './maintenanceState';
import { cacheCandidates } from './storageCachePolicy';
import type { StorageFile } from './storageCatalogue';
import type { RecoveryInventory } from './storageRecoveryInventory';
import { reclaimableRepositoryMetadata } from './storageMetadata';

export function storageOverview(input: {
  now: number;
  files: StorageFile[];
  state: MaintenanceState;
  data: StoredData;
  issues: StorageIssue[];
  recovery: RecoveryInventory;
  temporary: { directory: string; bytes: number; files: number; eligible: boolean; unclear?: boolean }[];
  metadata?: { root: string; isRepoBusy: (repo: string) => boolean };
}): StorageOverview {
  const { now, files, state, data, issues, recovery, temporary } = input;
  const reclaimable = new Set(cacheCandidates(files, state, now).map((file) => file.relative));
  const categories: StorageCategory[] = [
    ...(Object.keys(STORAGE_BUDGETS) as (keyof typeof STORAGE_BUDGETS)[]),
    'metadata',
    'temporary',
    'protected',
    'unknown',
    'updates',
    'recovery',
  ];
  const groups = categories.map((category) => ({
    category,
    files: files.filter((file) => file.category === category).length,
    bytes: files.filter((file) => file.category === category).reduce((sum, file) => sum + file.bytes, 0),
    reclaimableBytes: files.filter((file) => file.category === category && reclaimable.has(file.relative)).reduce((sum, file) => sum + file.bytes, 0),
    budget: category in STORAGE_BUDGETS ? STORAGE_BUDGETS[category as keyof typeof STORAGE_BUDGETS] : null,
  }));
  const tempGroup = groups.find((group) => group.category === 'temporary')!;
  for (const temp of temporary) {
    if (temp.unclear) {
      const group = groups.find((entry) => entry.category === 'unknown')!;
      group.bytes += temp.bytes;
      group.files += temp.files;
      issues.push({ category: 'unknown', path: temp.directory, reason: 'unrecognized-data' });
      continue;
    }
    tempGroup.bytes += temp.bytes;
    tempGroup.files += temp.files;
    if (temp.eligible) tempGroup.reclaimableBytes += temp.bytes;
    else issues.push({ category: 'temporary', path: temp.directory, reason: 'active-temporary-workspace' });
  }
  Object.assign(
    groups.find((group) => group.category === 'recovery')!,
    { bytes: recovery.bytes, files: recovery.files },
  );
  if (input.metadata)
    try {
      groups.find((group) => group.category === 'metadata')!.reclaimableBytes = reclaimableRepositoryMetadata(
        input.metadata.root,
        state,
        data,
        now,
        recovery.protectedPaths,
        input.metadata.isRepoBusy,
      );
    } catch {
      issues.push({ category: 'metadata', path: '', reason: 'metadata-unreadable' });
    }
  for (const file of files.filter((entry) => reclaimable.has(entry.relative)))
    issues.push({
      category: file.category,
      path: file.relative,
      reason: state.invalidated.includes(file.relative)
        ? 'cache-location-changed'
        : now - (state.usage[file.relative] ?? now) >= 30 * 86_400_000
          ? 'cache-unused'
          : 'cache-budget',
    });
  return {
    checkedAt: now,
    groups,
    issues: [
      ...issues,
      ...recovery.issues,
      ...files
        .filter((file) => file.category === 'unknown')
        .map((file) => ({ category: 'unknown' as const, path: file.relative, reason: 'unrecognized-data' })),
    ].slice(0, 200),
    repositories: data.repos.map((entry) => ({
      path: entry.path,
      health: state.observations[repositoryPathKey(entry.path)]?.health || 'unreachable',
      missingSince: state.observations[repositoryPathKey(entry.path)]?.missingSince ?? null,
      checkedDays: state.observations[repositoryPathKey(entry.path)]?.days.length || 0,
    })),
    removedRepositories: Object.values(state.removed),
    reports: state.reports,
  };
}
