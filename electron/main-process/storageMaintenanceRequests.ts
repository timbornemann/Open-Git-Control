import type { MaintenanceRequest } from '../../src/shared/ipc/storageMaintenance';

/** The renderer selects categories. Filesystem paths are never accepted or forwarded. */
export function validateMaintenanceRequest(value: unknown): MaintenanceRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid maintenance request.');
  const request = value as MaintenanceRequest;
  const allowed = ['previews', 'analytics', 'statistics', 'http', 'code', 'auxiliary', ...(request.mode === 'eligible' ? ['metadata', 'temporary'] : [])];
  if (
    !['eligible', 'all-caches'].includes(request.mode) ||
    (request.categories !== undefined && (!Array.isArray(request.categories) || request.categories.some((category) => !allowed.includes(category))))
  )
    throw new Error('Unsupported cleanup category.');
  return { mode: request.mode, ...(request.categories ? { categories: [...new Set(request.categories)] } : {}) };
}
