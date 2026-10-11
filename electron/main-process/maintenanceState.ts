import type { MaintenanceReport, RemovedRepository, RepositoryHealth } from '../../src/shared/ipc/storageMaintenance';
import type { StoredRepoEntry } from './repoStore';
import * as path from 'node:path';

export const DAY = 86_400_000;
export type RepositoryObservation = { health: RepositoryHealth; missingSince: number | null; days: string[] };
export interface MaintenanceState {
  version: 1;
  usage: Record<string, number>;
  firstSeen: Record<string, number>;
  observations: Record<string, RepositoryObservation>;
  removed: Record<string, RemovedRepository>;
  orphanOwners: Record<string, { path: string; observedAt: number }>;
  reports: MaintenanceReport[];
  browserClearedAt: Record<string, number>;
  known: StoredRepoEntry[];
  invalidated: string[];
  commonDirectories: Record<string, string>;
  temporarySeen: Record<string, number>;
}
export const newMaintenanceState = (): MaintenanceState => ({
  version: 1,
  usage: {},
  firstSeen: {},
  observations: {},
  removed: {},
  orphanOwners: {},
  reports: [],
  browserClearedAt: {},
  known: [],
  invalidated: [],
  commonDirectories: {},
  temporarySeen: {},
});
const object = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === 'object' && !Array.isArray(v));
const timestampMap = (v: unknown) => object(v) && Object.values(v).every((item) => typeof item === 'number' && Number.isFinite(item) && item >= 0);
const validEntry = (v: unknown) =>
  object(v) && typeof v.path === 'string' && typeof v.pinned === 'boolean' && Number.isFinite(v.lastOpened) && Number.isFinite(v.createdAt);
const validateAdditionalObservations = (value: Record<string, unknown>) => {
  // Version-one installations before recovery inventory have no recorded directories yet.
  value.commonDirectories ??= {};
  value.temporarySeen ??= {};
  if (!timestampMap(value.temporarySeen)) throw new Error('Invalid temporary workspace observations.');
  if (!object(value.commonDirectories) || Object.values(value.commonDirectories).some((dir) => typeof dir !== 'string' || !path.isAbsolute(dir)))
    throw new Error('Invalid recovery ownership map.');
};

/** Fail closed: damaged or future state must never shorten a retention period. */
export function parseMaintenanceState(value: unknown): MaintenanceState {
  if (
    !object(value) ||
    value.version !== 1 ||
    !timestampMap(value.usage) ||
    !timestampMap(value.firstSeen) ||
    !timestampMap(value.browserClearedAt) ||
    !object(value.observations) ||
    !object(value.removed) ||
    !object(value.orphanOwners) ||
    !Array.isArray(value.known) ||
    !value.known.every(validEntry) ||
    !Array.isArray(value.reports) ||
    !Array.isArray(value.invalidated) ||
    value.invalidated.some((file) => typeof file !== 'string')
  )
    throw new Error('Unsupported or damaged maintenance state.');
  validateAdditionalObservations(value);
  for (const entry of Object.values(value.observations)) {
    if (
      !object(entry) ||
      !['available', 'missing', 'unreachable', 'invalid', 'git-unavailable'].includes(String(entry.health)) ||
      (entry.missingSince !== null && !Number.isFinite(entry.missingSince)) ||
      !Array.isArray(entry.days) ||
      entry.days.some((day) => typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day))
    )
      throw new Error('Invalid repository observation.');
  }
  for (const ticket of Object.values(value.removed))
    if (
      !object(ticket) ||
      !validEntry(ticket.entry) ||
      !Number.isFinite(ticket.removedAt) ||
      !Number.isFinite(ticket.expiresAt) ||
      Number(ticket.expiresAt) - Number(ticket.removedAt) < 30 * DAY
    )
      throw new Error('Invalid repository return ticket.');
  for (const owner of Object.values(value.orphanOwners))
    if (!object(owner) || typeof owner.path !== 'string' || !Number.isFinite(owner.observedAt)) throw new Error('Invalid metadata owner observation.');
  if (
    value.reports.some(
      (report) =>
        !object(report) ||
        !Number.isFinite(report.startedAt) ||
        !Number.isFinite(report.finishedAt) ||
        !Array.isArray(report.errors) ||
        !Array.isArray(report.deferred) ||
        !Array.isArray(report.removedRepositories),
    )
  )
    throw new Error('Invalid maintenance report.');
  return value as unknown as MaintenanceState;
}
