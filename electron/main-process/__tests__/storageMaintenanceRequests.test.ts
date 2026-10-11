import { describe, expect, it } from 'vitest';
import { validateMaintenanceRequest } from '../storageMaintenanceRequests';

describe('fixed storage cleanup requests', () => {
  it('accepts categories, merges duplicates and drops filesystem parameters', () => {
    expect(
      validateMaintenanceRequest({ mode: 'eligible', categories: ['previews', 'metadata', 'previews'], path: 'C:/private', files: ['credentials.bin'] }),
    ).toEqual({ mode: 'eligible', categories: ['previews', 'metadata'] });
    expect(validateMaintenanceRequest({ mode: 'all-caches' })).toEqual({ mode: 'all-caches' });
  });
  it('rejects protected data, recovery operations, arbitrary paths and malformed requests', () => {
    for (const category of ['protected', 'recovery', 'unknown', 'updates', 'C:/private', '../credentials.bin', 'metadata', 'temporary'])
      expect(() => validateMaintenanceRequest({ mode: 'all-caches', categories: [category] })).toThrow('Unsupported');
    for (const categories of [null, false, 0, '', 'previews', {}])
      expect(() => validateMaintenanceRequest({ mode: 'eligible', categories })).toThrow('Unsupported');
    for (const request of [null, [], 'eligible', { mode: 'delete' }]) expect(() => validateMaintenanceRequest(request)).toThrow();
  });
});
