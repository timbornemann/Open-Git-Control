import type { RepositoryHealth } from '../../src/shared/ipc/storageMaintenance';
import type { StoredData } from './repoStore';
import type { RecoveryInventory } from './storageRecoveryInventory';
export interface MaintenanceDeps {
  root: string;
  readRepos: () => StoredData;
  writeRepos: (data: StoredData) => void;
  probe: (repo: string) => Promise<RepositoryHealth>;
  isRepoBusy: (repo: string) => boolean;
  now?: () => number;
  clearBrowser?: (categories: string[]) => Promise<void>;
  isBrowserBusy?: () => boolean;
  maintainStatistics?: (clear: boolean, cutoff: number) => boolean | Promise<boolean>;
  clearIcon?: (repo: string) => boolean;
  invalidateAnalytics?: () => void;
  temporary?: () => { directory: string; bytes: number; files: number; eligible: boolean; unclear?: boolean }[];
  cleanTemporary?: (allowed: Set<string>) => { bytes: number; files: number };
  updatesDirectory?: string;
  commonDirectory?: (repo: string) => string | undefined;
  recoveryInventory?: (directories: Record<string, string>) => Promise<RecoveryInventory>;
}
