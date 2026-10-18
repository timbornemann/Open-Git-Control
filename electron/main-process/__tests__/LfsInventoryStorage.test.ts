import * as fs from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { maintenanceFixture } from './maintenanceFixture';
import { leaseStorage } from '../managedStorage';
import { lfsInventoryDocument } from '../../git/GitLfsInventoryFormat';

const namespace = 'a'.repeat(64);
const document = () => lfsInventoryDocument({ version: 1, namespace, context: 'b'.repeat(64), objects: [], snapshots: [] });
let fixture: ReturnType<typeof maintenanceFixture> | undefined;
afterEach(() => {
  fixture?.dispose();
  fixture = undefined;
});

describe('managed LFS inventory storage', () => {
  it('declares caches as disposable auxiliary data and removes only verified owned files', async () => {
    fixture = maintenanceFixture();
    const file = fixture.file(`lfs-inventory-v1/${namespace}.json`, document());
    const future = fixture.file(`lfs-inventory-v1/${'c'.repeat(64)}.json`, { version: 999 });
    const wrongOwner = fixture.file(`lfs-inventory-v1/${'d'.repeat(64)}.json`, document());
    const unknown = fixture.file('lfs-inventory-v1/user-data.txt', 'preserve');
    const overview = await fixture.service.inspect();
    expect(overview.groups.find((group) => group.category === 'auxiliary')?.files).toBe(1);
    expect(overview.groups.find((group) => group.category === 'unknown')?.files).toBe(3);
    await fixture.service.run({ mode: 'all-caches', categories: ['auxiliary'] });
    expect(fs.existsSync(file)).toBe(false);
    for (const keep of [future, wrongOwner, unknown]) expect(fs.existsSync(keep)).toBe(true);
  });

  it('defers cleanup while an LFS cache writer holds a lease', async () => {
    fixture = maintenanceFixture();
    const file = fixture.file(`lfs-inventory-v1/${namespace}.json`, document());
    const release = leaseStorage(file);
    try {
      await fixture.service.run({ mode: 'all-caches' });
      expect(fs.existsSync(file)).toBe(true);
    } finally {
      release();
    }
    await fixture.service.run({ mode: 'all-caches' });
    expect(fs.existsSync(file)).toBe(false);
  });
});
